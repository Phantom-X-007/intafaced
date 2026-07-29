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
}
