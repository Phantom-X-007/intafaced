package com.bizzan.bitrade.controller.system;

import com.bizzan.bitrade.annotation.AccessLog;
import com.bizzan.bitrade.constant.AdminModule;
import com.bizzan.bitrade.constant.PageModel;
import com.bizzan.bitrade.constant.RewardRecordType;
import com.bizzan.bitrade.constant.TransactionType;
import com.bizzan.bitrade.controller.common.BaseAdminController;
import com.bizzan.bitrade.entity.*;
import com.bizzan.bitrade.es.ESUtils;
import com.bizzan.bitrade.service.*;
import com.bizzan.bitrade.util.BigDecimalUtils;
import com.bizzan.bitrade.util.MessageResult;
import com.querydsl.core.types.Predicate;

import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang.StringUtils;
import org.apache.shiro.authz.annotation.RequiresPermissions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.Assert;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;

import static com.bizzan.bitrade.util.BigDecimalUtils.*;

import java.math.BigDecimal;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 分红
 *
 * @author Shaoxianjun
 * @date 2019年03月21日
 */
@Slf4j
@RestController
@RequestMapping("/system/dividend")
public class DividendController extends BaseAdminController {
    @Autowired
    private OrderDetailAggregationService orderDetailAggregationService;
    @Autowired
    private DividendStartRecordService dividendStartRecordService;
    @Autowired
    private CoinService coinService;
    @Autowired
    private MemberWalletService memberWalletService;
    @Autowired
    private MemberTransactionService memberTransactionService;
    @Autowired
    private MemberService memberService;
    @Autowired
    private RewardRecordService rewardRecordService;
    @Autowired
    private ESUtils esUtils;

    /**
     * 查看手续费信息
     *
     * @return
     */
    @RequestMapping(value = "/fee/info", method = RequestMethod.POST)
    @RequiresPermissions("system:dividend:fee-query")
    @AccessLog(module = AdminModule.SYSTEM, operation = "查看手续费信息")
    public MessageResult statisticsFee(@RequestParam(value = "start") Date start,
                                       @RequestParam(value = "end") Date end) {
        if (end.before(start)) {
            return error("error,end Time before start Time");
        }
        MessageResult result = success();
        result.setData(orderDetailAggregationService.queryStatistics(start.getTime(), end.getTime()));
        return result;
    }

    /**
     * 创建分红
     *
     * @return
     */
    @RequestMapping(value = "/start", method = RequestMethod.POST)
    @RequiresPermissions("system:dividend:start")
    @Transactional(rollbackFor = Exception.class)
    @AccessLog(module = AdminModule.SYSTEM, operation = "开始分红")
    public MessageResult start(@RequestParam(value = "start") Date start,
                               @RequestParam(value = "end") Date end,
                               String unit, BigDecimal amount, BigDecimal rate, HttpServletRequest request) {
        if (end.before(start)) {
            return error("error,end Time before start Time");
        }

        Assert.isTrue(rate.compareTo(BigDecimal.ZERO) > 0 && rate.compareTo(new BigDecimal("100")) <= 0, "rate illegal");
        Assert.isTrue(amount.compareTo(BigDecimal.ZERO) > 0, "amount illegal");
        Coin coin = coinService.queryPlatformCoin();
        if (coin == null) {
            return error("please set platform coin");
        }

        // TODO 获取分红金额
        /*List<OrderDetailAggregation> list = orderDetailAggregationService.queryStatisticsByUnit(start.getTime(), end.getTime(), unit);
        if (list.size() > 0) {
            if (new BigDecimal(
                    list.stream()
                            .map(x -> x.getFee()).reduce((x, y) -> x + y)
                            .orElse(0d))
                    .setScale(4, BigDecimal.ROUND_HALF_UP).compareTo(amount) != 0) {
                return error("amount error");
            }
        } else {
            return error("coin error");
        }*/



        if (dividendStartRecordService.matchRecord(start.getTime(), end.getTime(), unit).size() > 0) {
            return error("time Repeat");
        }
        Admin admin = getAdmin(request);

        DividendStartRecord record = new DividendStartRecord();
        record.setAdmin(admin);
        BigDecimal dividend = BigDecimalUtils.mulRound(amount, BigDecimalUtils.getRate(rate), 6);
        record.setAmount(dividend);
        record.setEnd(end.getTime());
        record.setEndDate(end);
        record.setStart(start.getTime());
        record.setStartDate(start);
        record.setUnit(unit);
        record.setRate(rate);
        if (dividendStartRecordService.save(record) != null) {
            try {
                startDividend(unit, dividend, coin);
            } catch (Exception e) {
                log.error("dividend error!");
            }
        }
        MessageResult result = success();
        return result;
    }

    //分红
    public synchronized void startDividend(String unit, BigDecimal dividend, Coin coin) {
        // Dual-book Option B — admin has no compose service, so the 410 door never
        // executes. Pro-rata setBalance across every holder was the Grade C mint with
        // an explicit save(). ADR 2026-08-04: agents may throw where only a door stood.
        // Queue if ever re-enabled: ledger recipe rewardPay (not Java book).
        throw new IllegalStateException(
                "admin dividend is disabled: Java shell must not credit balances (INTAFACED dual-book)");
    }

    @RequiresPermissions("system:dividend:page-query")
    @PostMapping("page-query")
    public MessageResult pageQuery(
            PageModel pageModel,
            @RequestParam(value = "unit", required = false) String unit) {
        Predicate predicate = null;
        if (!StringUtils.isEmpty(unit)) {
            predicate = QDividendStartRecord.dividendStartRecord.unit.eq(unit);
        }
        Page<DividendStartRecord> all = dividendStartRecordService.findAll(predicate, pageModel);
        return success(all);
    }

}
