package com.intafaced.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.intafaced.dao.FeedbackDao;
import com.intafaced.entity.Feedback;
import com.intafaced.service.Base.BaseService;

/**
 * @author GS
 * @date 2018年03月19日
 */
@Service
public class FeedbackService extends BaseService {
    @Autowired
    private FeedbackDao feedbackDao;

    public Feedback save(Feedback feedback){
        return feedbackDao.save(feedback);
    }
}
