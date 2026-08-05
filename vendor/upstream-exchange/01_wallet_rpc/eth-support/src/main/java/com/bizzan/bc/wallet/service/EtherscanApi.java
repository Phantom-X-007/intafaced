package com.bizzan.bc.wallet.service;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.mashape.unirest.http.HttpResponse;
import com.mashape.unirest.http.Unirest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;


/**
 * Read-only Etherscan client.
 *
 * UNVERIFIED — there is no JDK, JRE or Maven on this host, so nothing in this
 * file has been compiled, run or tested. See the class note below.
 *
 * `sendRawTransaction` WAS HERE AND WAS DELETED. It POSTed an already-signed
 * withdrawal to the `eth_sendRawTransaction` proxy at the hardcoded MAINNET
 * endpoint below, as a SECOND broadcast, after PaymentHandler had already
 * submitted the identical bytes to the configured `coin.rpc` node. That second
 * hop is what made "point coin.rpc at a testnet" useless as containment: the
 * mainnet copy was the one that landed. Its only two callers were
 * PaymentHandler.transferEth and PaymentHandler.transferToken, and both are
 * gone with it (see the note in that class).
 *
 * The class survives the deletion because `checkEventLog` is a DIFFERENT and
 * still-live path: the deposit watchers in erc-token and erc-eusdt call it to
 * confirm an ERC-20 Transfer event. It reads logs. It broadcasts nothing, signs
 * nothing and moves nothing, so removing the write path does not strand it.
 *
 * The endpoint literal therefore remains on the read path, and remains frozen
 * by tooling/ci/wallet-rpc-mainnet-scan.mjs rule M2. Making it configurable is
 * an owner action, not this change: nothing in this repository can build,
 * containerise or boot this module, and it must stay that way until the review
 * the vendored-exchange ADR makes a precondition of adoption has happened.
 */
public class EtherscanApi {
    private Logger logger = LoggerFactory.getLogger(EtherscanApi.class);
    private String token;

    public boolean checkEventLog(final Long blockHeight,String address,String topic0,String txid){
        try {
            HttpResponse<String> response = Unirest.post("https://api.etherscan.io/api")
                    .field("module", "logs")
                    .field("action", "getLogs")
                    .field("fromBlock", blockHeight)
                    .field("toBlock",blockHeight)
                    .field("address",address)
                    .field("topic0",topic0)
                    .field("apikey", token)
                    .asString();
            logger.info("getLogs result = {}",response.getBody());
            JSONObject result = JSON.parseObject(response.getBody());
            if(result.getInteger("status")==0){
                return false;
            }
            else{
                JSONArray txs = result.getJSONArray("result");
                for(int i=0;i<txs.size();i++){
                    JSONObject item = txs.getJSONObject(i);
                    if(item.getString("transactionHash").equalsIgnoreCase(txid))return true;
                }
                return false;
            }

        }
        catch (Exception e){
            e.printStackTrace();
            return false;
        }
    }


    public static void main(String[] args){
        EtherscanApi api = new EtherscanApi();
        // A commented-out call to the deleted sendRawTransaction, carrying a signed
        // raw transaction, was removed here with the method it named.
        String txid = "0x4d95cdb7864f4aab4a349dbd2e3f8b9db1deb0f85f85d9a8c37a677958129c97";
        boolean ret = api.checkEventLog(6030689L,"0x0b42c73446e4090a7c1db8ac00ad46a38ccbc2ac","0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",txid);
        System.out.println(ret);
    }
}
