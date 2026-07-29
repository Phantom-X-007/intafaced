package com.intafaced.test.service;

import org.junit.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.intafaced.entity.Member;
import com.intafaced.service.MemberService;
import com.intafaced.test.BaseTest;


public class MemberServiceTest extends BaseTest {

	@Autowired
	private MemberService memberService;
	
	@Test
	public void test() {
        Member member=memberService.findOne(25L);
        System.out.println(">>>>>>>>>>>>>>"+member);
        
	}

}
