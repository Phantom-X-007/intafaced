package com.bizzan.bc.wallet.entity;


import lombok.Data;

import java.math.BigDecimal;
import java.math.BigInteger;

@Data
public class Coin {
    private String name;
    private String unit;
    private String rpc;
    private String keystorePath;
    /**
     * Password used to encrypt and to unlock the per-address deposit keystore
     * files stored under keystorePath. It comes from configuration only - never
     * from a request parameter - and must never be blank. Enforced at startup
     * by KeystorePasswordValidator.
     */
    private String keystorePassword;
    private BigDecimal defaultMinerFee;
    private String withdrawAddress;
    private String withdrawWallet;
    private String withdrawWalletPassword;
    private BigDecimal minCollectAmount;
    private BigInteger gasLimit;
    private BigDecimal gasSpeedUp = BigDecimal.ONE;
    private BigDecimal rechargeMinerFee;
    private String ignoreFromAddress;
    private String masterAddress;
    /**
     * EIP-155 chain id for the EVM-family withdrawal signing path.
     *
     * <p>NO DEFAULT, deliberately. A default of 1 would be mainnet-by-omission,
     * which is the precise failure the wallet-RPC perimeter exists to prevent: a
     * service that reaches mainnet because nobody set a variable. An unset value
     * must stop the service, and PaymentHandler refuses to construct without it.
     *
     * <p>Declared {@code Long} even though web3j 3.3.1 narrows it to a
     * {@code byte} at the call site: the configuration should carry the true
     * value, and the narrowing belongs where it can be range-checked and
     * rejected loudly. See PaymentHandler#eip155ChainId and
     * docs/SPEC-EIP155-WALLET-RPC-WITHDRAWAL-SIGNING.md.
     *
     * <p>Coin is shared by every module via rpc-common, so this field also
     * appears on the bitcoinj-family modules (bch, ltc, xmr, ...) that have no
     * use for it. That is harmless — nothing outside the EVM signing path reads
     * it — but it is stated here rather than left to be discovered.
     */
    private Long chainId;
}
