package com.intafaced.dao;

import org.springframework.data.jpa.repository.Query;

import com.intafaced.dao.base.BaseDao;
import com.intafaced.dto.SmsDTO;

import java.util.List;

/**
 * @Description:
 * @author: GuoShuai
 * @date: create in 9:47 2018/6/28
 * @Modified:
 */
public interface SmsDao extends BaseDao<SmsDTO> {
    
    @Query(value = "select * from tb_sms where sms_status = '0' ",nativeQuery = true)
    SmsDTO findBySmsStatus();
}
