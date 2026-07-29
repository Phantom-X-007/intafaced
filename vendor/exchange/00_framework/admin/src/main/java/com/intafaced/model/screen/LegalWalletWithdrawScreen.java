package com.intafaced.model.screen;

import com.intafaced.constant.WithdrawStatus;

import lombok.Data;

@Data
public class LegalWalletWithdrawScreen {
    WithdrawStatus status;
    String username;
    String coinName;

}
