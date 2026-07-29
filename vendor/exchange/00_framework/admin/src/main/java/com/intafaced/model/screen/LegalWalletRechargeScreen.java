package com.intafaced.model.screen;

import com.intafaced.constant.LegalWalletState;

import lombok.Data;

@Data
public class LegalWalletRechargeScreen {
    LegalWalletState status;
    String username;
    String coinName;

}
