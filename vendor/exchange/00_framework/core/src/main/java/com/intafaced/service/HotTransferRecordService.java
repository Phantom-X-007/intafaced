package com.intafaced.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.intafaced.dao.HotTransferRecordDao;
import com.intafaced.entity.HotTransferRecord;
import com.intafaced.service.Base.TopBaseService;

@Service
public class HotTransferRecordService extends TopBaseService<HotTransferRecord,HotTransferRecordDao> {

    @Override
    @Autowired
    public void setDao(HotTransferRecordDao dao) {
        super.setDao(dao);
    }
}
