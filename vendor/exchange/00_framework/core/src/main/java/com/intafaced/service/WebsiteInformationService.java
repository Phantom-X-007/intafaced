package com.intafaced.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.intafaced.dao.WebsiteInformationDao;
import com.intafaced.entity.QWebsiteInformation;
import com.intafaced.entity.WebsiteInformation;
import com.intafaced.service.Base.BaseService;

/**
 * @author GS
 * @description
 * @date 2018/1/26 10:18
 */
@Service
public class WebsiteInformationService extends BaseService {
    @Autowired
    private WebsiteInformationDao websiteInformationDao;

    @Transactional(readOnly = true)
    public WebsiteInformation fetchOne() {
        QWebsiteInformation qEntity = QWebsiteInformation.websiteInformation;
        return queryFactory.selectFrom(qEntity).fetchOne();
    }

    public WebsiteInformation save(WebsiteInformation websiteInformation) {
        return websiteInformationDao.save(websiteInformation);
    }

}
