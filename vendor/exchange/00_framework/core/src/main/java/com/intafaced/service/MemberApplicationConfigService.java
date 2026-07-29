package com.intafaced.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.intafaced.dao.MemberApplicationConfigDao;
import com.intafaced.entity.MemberApplicationConfig;
import com.intafaced.service.Base.TopBaseService;

import java.util.List;

@Service
public class MemberApplicationConfigService extends TopBaseService<MemberApplicationConfig,MemberApplicationConfigDao>{

    @Override
    @Autowired
    public void setDao(MemberApplicationConfigDao dao) {
        super.setDao(dao);
    }

    public MemberApplicationConfig get(){
        List<MemberApplicationConfig> list = dao.findAll() ;
        return list!=null&&list.size()>0 ? list.get(0) : null;
    }
}
