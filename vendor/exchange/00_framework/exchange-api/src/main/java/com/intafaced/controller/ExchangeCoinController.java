package com.intafaced.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.intafaced.controller.BaseController;
import com.intafaced.service.ExchangeCoinService;
import com.intafaced.util.MessageResult;

import java.util.List;

/**
 * @author Shaoxianjun
 * @Title: ${file_name}
 * @Description:
 * @date 2019/4/1816:54
 */
@RestController
@RequestMapping("exchange-coin")
public class ExchangeCoinController extends BaseController {
    @Autowired
    private ExchangeCoinService service;

    //获取基币
    @RequestMapping("base-symbol")
    public MessageResult baseSymbol() {
        List<String> baseSymbol = service.getBaseSymbol();
        if (baseSymbol != null && baseSymbol.size() > 0) {
            return success(baseSymbol);
        }
        return error("baseSymbol null");

    }

}
