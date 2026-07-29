package com.intafaced.controller.promotion;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.intafaced.constant.PageModel;
import com.intafaced.model.RewardRecordScreen;
import com.intafaced.service.RewardRecordService;
import com.intafaced.util.MessageResult;

/**
 * 奖励记录
 * @author shaox
 *
 */
@RestController
@RequestMapping("promotion/reward-record")
public class RewardRecordController {

    @Autowired
    private RewardRecordService rewardRecordService ;

    @PostMapping("page-query")
    public MessageResult page(PageModel pageModel, RewardRecordScreen screen){
        return null;
    }
}
