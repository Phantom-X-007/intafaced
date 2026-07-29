package com.intafaced.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import com.intafaced.dao.MiningOrderDao;
import com.intafaced.dao.MiningOrderDetailDao;
import com.intafaced.entity.ActivityOrder;
import com.intafaced.entity.MiningOrder;
import com.intafaced.entity.MiningOrderDetail;
import com.intafaced.pagination.Criteria;
import com.intafaced.pagination.Restrictions;
import com.intafaced.service.Base.BaseService;
import com.querydsl.core.types.Predicate;
@Service
public class MiningOrderDetailService extends BaseService {
	@Autowired
	private MiningOrderDetailDao miningOrderDetailDao;
	
	public MiningOrderDetail findOne(Long id) {
		return miningOrderDetailDao.findOne(id);
	}
	
    public MiningOrderDetail save(MiningOrderDetail miningOrderDetail) {
        return miningOrderDetailDao.save(miningOrderDetail);
    }

    public MiningOrderDetail saveAndFlush(MiningOrderDetail miningOrderDetail) {
        return miningOrderDetailDao.saveAndFlush(miningOrderDetail);
    }
    
    public Page<MiningOrderDetail> findAll(Predicate predicate, Pageable pageable){
    	return miningOrderDetailDao.findAll(predicate, pageable);
    }
    
    public Page<MiningOrderDetail> findAllByMemberId(Long memberId, int pageNo, int pageSize) {
    	Sort orders = Criteria.sortStatic("createTime.desc");
        //分页参数
        PageRequest pageRequest = new PageRequest(pageNo - 1, pageSize, orders);
        //查询条件
        Criteria<MiningOrderDetail> specification = new Criteria<MiningOrderDetail>();
        specification.add(Restrictions.eq("memberId", memberId, false));
        
        return miningOrderDetailDao.findAll(specification, pageRequest);
    }
    
    public Page<MiningOrderDetail> findAllByMiningOrderId(Long miningOrderId, int pageNo, int pageSize) {
    	Sort orders = Criteria.sortStatic("createTime.desc");
        //分页参数
        PageRequest pageRequest = new PageRequest(pageNo - 1, pageSize, orders);
        //查询条件
        Criteria<MiningOrderDetail> specification = new Criteria<MiningOrderDetail>();
        specification.add(Restrictions.eq("miningOrderId", miningOrderId, false));
        
        return miningOrderDetailDao.findAll(specification, pageRequest);
    }
}
