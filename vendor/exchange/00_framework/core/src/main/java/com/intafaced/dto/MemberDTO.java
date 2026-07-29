package com.intafaced.dto;

import lombok.Data;

import java.util.List;

import com.intafaced.entity.Member;
import com.intafaced.entity.MemberWallet;

@Data
public class MemberDTO {

    private Member member ;

    private List<MemberWallet> list ;

}
