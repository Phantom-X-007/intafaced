package com.intafaced.service;

import com.intafaced.dao.DividendStartRecordDao;
import com.intafaced.entity.DividendStartRecord;
import com.intafaced.service.Base.TopBaseService;
import com.querydsl.core.types.Predicate;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * @author GS
 * @date 2018年03月22日
 */
@Service
public class DividendStartRecordService extends TopBaseService<DividendStartRecord, DividendStartRecordDao> {

    @Override
    @Autowired
    public void setDao(DividendStartRecordDao dao) {
        super.setDao(dao);
    }

    public List<DividendStartRecord> matchRecord(long start, long end, String unit) {
        return dao.findAllByTimeAndUnit(start, end, unit);
    }

    @Override
    public DividendStartRecord save(DividendStartRecord dividendStartRecord) {
        return dao.save(dividendStartRecord);
    }


}
