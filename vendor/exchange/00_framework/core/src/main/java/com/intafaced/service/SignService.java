package com.intafaced.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.intafaced.constant.SignStatus;
import com.intafaced.dao.SignDao;
import com.intafaced.entity.Sign;
import com.intafaced.service.Base.TopBaseService;

/**
 * @author GS
 * @Description:
 * @date 2018/5/311:11
 */
@Service
public class SignService extends TopBaseService<Sign, SignDao> {


    @Override
    @Autowired
    public void setDao(SignDao dao) {
        super.setDao(dao);
    }

    public Sign fetchUnderway() {
        return dao.findByStatus(SignStatus.UNDERWAY);
    }

    /**
     * 提前关闭
     *
     * @param sign 提前关闭
     */
    public void earlyClosing(Sign sign) {
        sign.setStatus(SignStatus.FINISH);
        dao.save(sign);
    }

}
