package com.bizzan.bc.wallet.service;


import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.bizzan.bc.wallet.entity.Coin;
import com.bizzan.bc.wallet.entity.Contract;
import com.bizzan.bc.wallet.entity.Payment;
import com.bizzan.bc.wallet.util.EthConvert;
import com.bizzan.bc.wallet.util.MessageResult;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.web3j.abi.FunctionEncoder;
import org.web3j.abi.TypeReference;
import org.web3j.abi.datatypes.Address;
import org.web3j.abi.datatypes.Function;
import org.web3j.abi.datatypes.generated.Uint256;
import org.web3j.crypto.*;
import org.web3j.protocol.Web3j;
import org.web3j.protocol.core.DefaultBlockParameterName;
import org.web3j.protocol.core.methods.response.EthGetTransactionCount;
import org.web3j.protocol.core.methods.response.EthSendTransaction;
import org.web3j.utils.Convert;
import org.web3j.utils.Numeric;

import javax.annotation.PostConstruct;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedList;
import java.util.List;


/**
 * ETH与Token付款模块，支持同步任务与异步任务，在单地址可能出现连续付款的情况的下，使用异步阶列
 *
 * ── EIP-155: BOTH WITHDRAWAL PATHS NOW SIGN FOR ONE CHAIN ──────────────────
 *
 * COMPILED AND TESTED. A JDK 8 and Maven exist for this tree now, and
 * PaymentHandlerEip155Test is a known-answer fixture suite: fixed key, fixed
 * nonce/gas/to/value, fixed chain id, asserted against raw-transaction bytes
 * produced by a DIFFERENT implementation (viem 2.55.8), with the chain-id-1
 * ether case additionally identical to the test vector published in EIP-155
 * itself. See docs/SPEC-EIP155-WALLET-RPC-WITHDRAWAL-SIGNING.md §3.
 *
 * transferEth and transferToken used the two-argument
 * {@code TransactionEncoder.signMessage(tx, credentials)}. That overload takes
 * no chain id: it is the pre-EIP-155 encoding, and the signature it produces is
 * valid on EVERY EVM chain at once, mainnet included, whatever coin.rpc points
 * at. Anyone who observed a testnet withdrawal could replay those exact bytes
 * onto mainnet, from the same account, for the same amount. Both call sites now
 * go through {@link #signToHex}, which passes the configured chain id.
 *
 * ── THE CEILING, AND WHY IT IS 109 ─────────────────────────────────────────
 *
 * web3j 3.3.1's EIP-155 overload takes the chain id as a {@code byte}:
 *
 *   public static byte[] signMessage(RawTransaction, byte, Credentials)
 *   public static Sign$SignatureData createEip155SignatureData(Sign$SignatureData, byte)
 *
 * and computes {@code v = (byte)(getV() + (chainId << 1) + 8)} — the truncation
 * lands on the RESULT. That does NOT cap the chain id at 127, and it does not
 * cap it at 45 either: {@code RlpString.create(byte)} stores the raw byte and
 * RLP reads bytes UNSIGNED, so every v from 0 to 255 round-trips correctly
 * through two's complement. Chain id 46 produces v = (byte)128 = -128, which
 * RLP-encodes as 0x80 and a node reads back as 128, which is exactly right.
 *
 * The real ceiling is where the true v stops fitting in eight bits at all:
 *
 *   v = 2 * chainId + 35  (recovery id 0)   or   2 * chainId + 36  (recovery id 1)
 *
 * so chain id 109 gives 253/254 and is the last one that always works; 110
 * gives 255/256, and the 256 truncates to ZERO — a signature that is correct
 * for recovery id 0 and malformed for recovery id 1, i.e. WRONG ABOUT HALF THE
 * TIME, chosen by the signature nonce and not by anything an operator controls.
 * 111 and above are always wrong. This was measured, not reasoned: chain ids
 * 1..300 x four keys were signed with this jar and compared byte-for-byte
 * against viem; 1..109 match on every key, 110 matches on three of four, 111+
 * on none.
 *
 * Consequence, stated plainly so nobody has to rediscover it: BSC (56) IS
 * reachable on this library. Polygon (137), Arbitrum (42161), Optimism (10 —
 * fine), Holesky (17000) and Sepolia (11155111) are NOT, and no amount of
 * casting makes them so. Reaching those needs a web3j upgrade, which is a
 * dependency change on unreviewed custody code and is not this change.
 *
 * {@link #eip155ChainId} therefore REFUSES rather than truncates, at startup
 * and again at every signature. A loud refusal is strictly better than a
 * silently half-valid signature on a withdrawal path.
 *
 * ── WHAT WAS REMOVED EARLIER, AND WHY IT WAS A DELETION ────────────────────
 *
 * Both withdrawal paths — transferEth and transferToken — used to broadcast the
 * SAME signed transaction TWICE:
 *
 *   1. web3j.ethSendRawTransaction(hexValue)   → the configured coin.rpc node
 *   2. etherscanApi.sendRawTransaction(hexValue) → https://api.etherscan.io/api,
 *      hardcoded, Ethereum MAINNET, with no property behind it
 *
 * The second hop is now gone, along with the EtherscanApi field that reached it.
 *
 * It is safe to remove without a compiler because it touched nothing that
 * builds or signs the transaction. `hexValue` is already-signed bytes by the
 * time either call sees it; the second call read it and did not produce it. The
 * txid this method returns has always come from the FIRST broadcast — the
 * Etherscan response was logged and discarded, its return type is void, and
 * both call sites sat inside `if (etherscanApi != null)`, so the whole path was
 * already optional at runtime and every caller already had to work without it.
 * Nothing downstream — the notify/kafka path, checkJob, the task queue — ever
 * read anything the deleted lines produced.
 *
 * What it DID do was defeat containment. Aiming coin.rpc at a testnet node
 * never contained a withdrawal, because the mainnet relay got an identical copy
 * of the same signed bytes and that copy is the one that lands. Removing it does
 * not by itself make the signature safe — that was a SEPARATE defect, and it is
 * the one fixed above. It removes the path that made the network selector
 * irrelevant; EIP-155 is what makes the selector mean something.
 *
 * EtherscanApi itself is NOT deleted: its checkEventLog method is a live
 * read-only path used by the erc-token and erc-eusdt deposit watchers, and the
 * @Bean in EthConfig stays for them.
 */
@Component
public class PaymentHandler {

    /**
     * The largest EIP-155 chain id web3j 3.3.1 can sign CORRECTLY.
     *
     * <p>Not a style choice and not a guess — see the class note. v is
     * {@code 2 * chainId + 35} or {@code 2 * chainId + 36} and web3j narrows it
     * to a byte, so 109 yields 253/254 (both fine) and 110 yields 255/256, where
     * the 256 truncates to zero. 110 is therefore correct only for recovery id
     * 0 and malformed for recovery id 1 — right about half the time, decided by
     * the signature nonce. Measured against this exact jar and cross-checked
     * against an independent implementation for every chain id from 1 to 300.
     */
    static final long MAX_EIP155_CHAIN_ID = 109L;

    private Logger logger = LoggerFactory.getLogger(PaymentHandler.class);
    @Autowired
    private Web3j web3j;
    @Autowired
    private EthService ethService;
    @Autowired(required = false)
    private Contract contract;
    @Autowired
    private Coin coin;
    @Autowired
    private KafkaTemplate<String,String> kafkaTemplate;
    private Payment current;
    private LinkedList<Payment> tasks = new LinkedList<>();
    private int checkTimes = 0;
    private int maxCheckTimes = 100;

    /**
     * Refuse to exist without a usable chain id.
     *
     * <p>The bean that signs withdrawals is the right place for this: if it
     * cannot be constructed the Spring context fails and the service does not
     * start. A service that will not boot is an outage; a service that boots and
     * signs a transaction that is valid on every EVM chain is a loss of custody.
     * Same shape as KeystorePasswordValidator, and the same reasoning as every
     * {@code ${...}} placeholder in the property files: an unset value must stop
     * the service, never quietly select a default.
     *
     * <p>The check is repeated at signing time in {@link #signToHex} rather than
     * trusted from here, because Coin is a mutable @ConfigurationProperties bean
     * and a startup check proves what was true at startup.
     */
    @PostConstruct
    public void requireEip155ChainId() {
        eip155ChainId(coin.getChainId());
    }

    /**
     * The configured EIP-155 chain id, narrowed to the width web3j 3.3.1 takes,
     * or an exception. Never a truncation, never a default.
     *
     * <p>Package-private and static so the known-answer fixture tests can call
     * it directly without a Spring context; nothing outside this class uses it.
     *
     * @throws IllegalStateException if the chain id is unset, non-positive, or
     *     above {@link #MAX_EIP155_CHAIN_ID}
     */
    static byte eip155ChainId(Long configured) {
        if (configured == null) {
            throw new IllegalStateException(
                    "coin.chain-id is not set. Set the ETH_CHAIN_ID environment variable. Refusing to sign: without a "
                            + "chain id this signs pre-EIP-155, and the resulting transaction is replay-valid on every "
                            + "EVM chain at once, mainnet included, whatever coin.rpc points at.");
        }
        if (configured < 1L) {
            // The message deliberately spells the sentinel out rather than naming
            // the constant: rule M3 of tooling/ci/wallet-rpc-mainnet-scan.mjs bans
            // that identifier anywhere in this tree, string literals included, and
            // it is right to - see the note on that rule.
            throw new IllegalStateException(
                    "coin.chain-id=" + configured + " is not a chain id. Refusing to sign: 0 and -1 are web3j's "
                            + "no-chain-id sentinels on this version, and either one reproduces exactly the "
                            + "pre-EIP-155 signature this guard exists to prevent.");
        }
        if (configured > MAX_EIP155_CHAIN_ID) {
            throw new IllegalStateException(
                    "coin.chain-id=" + configured + " cannot be signed correctly by web3j 3.3.1, which takes the chain "
                            + "id as a byte and truncates v = 2*chainId+35|36 to eight bits. The last id that always "
                            + "works is " + MAX_EIP155_CHAIN_ID + "; " + (MAX_EIP155_CHAIN_ID + 1) + " is valid for one "
                            + "recovery id and malformed for the other, i.e. wrong about half the time. Refusing to "
                            + "sign rather than emit a signature that is right by luck. Reaching this chain needs a "
                            + "web3j upgrade - see docs/SPEC-EIP155-WALLET-RPC-WITHDRAWAL-SIGNING.md.");
        }
        return configured.byteValue();
    }

    /**
     * Sign a transaction for exactly one chain and return the hex the node takes.
     *
     * <p>Both withdrawal paths go through here so neither can drift back to the
     * two-argument, chain-id-less overload independently of the other.
     *
     * <p>Static, so the fixture tests can assert the exact resulting bytes with
     * no Spring context, no node and no network.
     */
    static String signToHex(RawTransaction transaction, Long chainId, Credentials credentials) {
        return Numeric.toHexString(TransactionEncoder.signMessage(transaction, eip155ChainId(chainId), credentials));
    }

    public void transferTokenAsync(Credentials credentials, String to, BigDecimal amount,String withdrawId){
        Payment payment = Payment.builder()
                .credentials(credentials)
                .amount(amount)
                .to(to)
                .txBizNumber(withdrawId)
                .unit(coin.getUnit())
                .build();
        synchronized (tasks) {
            tasks.addLast(payment);
        }
    }

    public void notify(Payment payment,int status){
        JSONObject json = new JSONObject();
        json.put("withdrawId",payment.getTxBizNumber());
        json.put("txid",payment.getTxid());
        json.put("status",status);
        kafkaTemplate.send("withdraw-notify",coin.getName(), JSON.toJSONString(json));
    }

    public void transferEthAsync(Credentials credentials, String to, BigDecimal amount,String withdrawId){
        Payment payment = Payment.builder()
                .credentials(credentials)
                .amount(amount)
                .to(to)
                .txBizNumber(withdrawId)
                .unit("ETH")
                .build();
        synchronized (tasks) {
            tasks.addLast(payment);
        }
    }

    public MessageResult transferEth(Credentials credentials, String to, BigDecimal amount) {
        Payment payment = Payment.builder()
                .credentials(credentials)
                .amount(amount)
                .to(to)
                .unit("ETH")
                .build();
        return transferEth(payment);
    }

    public MessageResult transferEth(Payment payment) {
        try {
            EthGetTransactionCount ethGetTransactionCount = web3j.ethGetTransactionCount(payment.getCredentials().getAddress(), DefaultBlockParameterName.LATEST)
                    .sendAsync()
                    .get();

            BigInteger nonce = ethGetTransactionCount.getTransactionCount();
            BigInteger gasPrice = ethService.getGasPrice();
            BigInteger value = Convert.toWei(payment.getAmount(), Convert.Unit.ETHER).toBigInteger();

            BigInteger maxGas = coin.getGasLimit();
            logger.info("value={},gasPrice={},gasLimit={},nonce={},address={}", value, gasPrice, maxGas, nonce, payment.getTo());
            RawTransaction rawTransaction = RawTransaction.createEtherTransaction(
                    nonce, gasPrice, maxGas, payment.getTo(), value);

            String hexValue = signToHex(rawTransaction, coin.getChainId(), payment.getCredentials());
            EthSendTransaction ethSendTransaction = web3j.ethSendRawTransaction(hexValue).sendAsync().get();
            String transactionHash = ethSendTransaction.getTransactionHash();
            logger.info("txid = {}", transactionHash);
            if (StringUtils.isEmpty(transactionHash)) {
                return new MessageResult(500, "发送交易失败");
            }
            else {
                // The second, mainnet Etherscan broadcast of this same signed
                // transaction was here and was deleted — see the class note.
                MessageResult mr = new MessageResult(0, "success");
                mr.setData(transactionHash);
                return mr;
            }
        } catch (Exception e) {
            e.printStackTrace();
            return new MessageResult(500, "交易失败,error:" + e.getMessage());
        }
    }

    public MessageResult transferToken(Payment payment){
        try {
            EthGetTransactionCount ethGetTransactionCount = web3j.ethGetTransactionCount(payment.getCredentials().getAddress(), DefaultBlockParameterName.LATEST)
                    .sendAsync()
                    .get();
            BigInteger nonce = ethGetTransactionCount.getTransactionCount();
            BigInteger gasPrice = ethService.getGasPrice();
            BigInteger value = EthConvert.toWei(payment.getAmount(), contract.getUnit()).toBigInteger();
            Function fn = new Function("transfer", Arrays.asList(new Address(payment.getTo()), new Uint256(value)), Collections.<TypeReference<?>> emptyList());
            String data = FunctionEncoder.encode(fn);
            BigInteger maxGas = contract.getGasLimit();
            logger.info("from={},value={},gasPrice={},gasLimit={},nonce={},address={}",payment.getCredentials().getAddress(), value, gasPrice, maxGas, nonce,payment.getTo());
            RawTransaction rawTransaction = RawTransaction.createTransaction(
                    nonce, gasPrice, maxGas, contract.getAddress(), data);
            String hexValue = signToHex(rawTransaction, coin.getChainId(), payment.getCredentials());
            logger.info("hexRawValue={}",hexValue);
            EthSendTransaction ethSendTransaction = web3j.ethSendRawTransaction(hexValue).sendAsync().get();
            String transactionHash = ethSendTransaction.getTransactionHash();
            logger.info("txid:" + transactionHash);
            if (StringUtils.isEmpty(transactionHash)) {
                return new MessageResult(500, "发送交易失败");
            }
            else {
                // The second, mainnet Etherscan broadcast of this same signed
                // transaction was here and was deleted — see the class note.
                payment.setTxid(transactionHash);
                MessageResult mr = new MessageResult(0, "success");
                mr.setData(transactionHash);
                return mr;
            }
        } catch (Exception e) {
            e.printStackTrace();
            return new MessageResult(500, "交易失败,error:" + e.getMessage());
        }
    }

    public MessageResult transferToken(Credentials credentials, String to, BigDecimal amount) {
        Payment payment = Payment.builder()
                .credentials(credentials)
                .amount(amount)
                .to(to)
                .unit(coin.getUnit())
                .build();
        return transferToken(payment);
    }

    /**
     * 检查当前任务是否支付完成
     */
    @Scheduled(cron = "0/30 * * * * *")
    public synchronized void checkJob(){
        logger.info("检查付款任务状态");
//        && StringUtils.isNotEmpty(current.getTxid())
        if (current != null ) {
            synchronized (current) {
                try {
                    checkTimes ++;
                    if (ethService.isTransactionSuccess(current.getTxid())) {
                        logger.info("转账{}已成功,检查次数:{}", JSON.toJSON(current),checkTimes);
                        notify(current,1);
                        current = null;
                    }
                    else{
                        logger.info("转账{}未成功,检查次数:{}", JSON.toJSON(current),checkTimes);
                        if(checkTimes > maxCheckTimes){
                            //超时未成功
                            notify(current,0);
                            current = null;
                        }
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
        }
        else{
            logger.info("无待确认的任务");
        }
    }

    public MessageResult transfer(Payment payment){
        if(payment.getUnit().equalsIgnoreCase("ETH")){
            return transferEth(payment);
        }
        else{
            return transferToken(payment);
        }
    }

    @Scheduled(cron = "0/30 * * * * *")
    public synchronized void doJob(){
        synchronized (tasks) {
            logger.info("开始执行付款任务，当前队列长度{}",tasks.size());
            if (current == null && tasks.size() > 0) {
                logger.info("开始执行付款任务:current---"+JSONObject.toJSONString(current));
                Payment payment = tasks.getFirst();
                MessageResult result = transfer(payment);
                if (result.getCode() == 0) {
                    logger.info("------txID:"+result.getData().toString());
                    payment.setTxid(result.getData().toString());
                    tasks.removeFirst();
                    current = payment;
                    checkTimes = 0;
                }
            }
        }
    }
}
