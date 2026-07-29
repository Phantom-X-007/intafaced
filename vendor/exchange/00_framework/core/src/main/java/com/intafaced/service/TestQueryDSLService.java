package com.intafaced.service;

import com.intafaced.constant.MemberLevelEnum;
import com.intafaced.dao.AdvertiseDao;
import com.intafaced.entity.Advertise;
import com.intafaced.entity.QAdvertise;
import com.intafaced.pagination.Criteria;
import com.intafaced.service.Base.BaseService;
import com.querydsl.core.types.Predicate;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import javax.inject.Provider;
import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import java.util.List;

@Service
public class TestQueryDSLService extends BaseService {
    @Autowired
    private AdvertiseDao advertiseDao;
 
    @Autowired
    private EntityManager entityManager;
    //查询工厂实体
    private JPAQueryFactory queryFactory;
    //实例化控制器完成后执行该方法实例化JPAQueryFactory
    @PostConstruct
    public void initFactory()
    {
        queryFactory = new JPAQueryFactory(entityManager);
    }
 

    public Page<Advertise> test(int page) {

        //动态条件
        QAdvertise qAdvertise = QAdvertise.advertise;
        Predicate predicate = qAdvertise.id.gt(1);
        //分页排序
        Sort orders = Criteria.sortStatic("id");
        PageRequest pageRequest = new PageRequest(page-1, 10, orders);
        //Page<Advertise> all = advertiseDao.findAll(predicate, pageRequest);
        return advertiseDao.findAll(predicate,pageRequest);
    }
    public List<Advertise> test2() {
        QAdvertise quser = QAdvertise.advertise;
        return queryFactory.selectFrom(quser)
                .fetch();
    }
}
