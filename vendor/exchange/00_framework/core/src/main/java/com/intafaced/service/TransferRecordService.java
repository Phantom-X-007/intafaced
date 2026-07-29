package com.intafaced.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.intafaced.dao.TransferRecordDao;
import com.intafaced.entity.TransferRecord;
import com.intafaced.pagination.Criteria;
import com.intafaced.pagination.Restrictions;
import com.intafaced.service.Base.BaseService;

/**
 * @author GS
 * @date 2018年02月27日
 */
@Service
public class TransferRecordService extends BaseService {
    @Autowired
    private TransferRecordDao transferRecordDao;

    public TransferRecord save(TransferRecord transferRecord){
        return transferRecordDao.save(transferRecord);
    }

    @Transactional(readOnly = true)
    public Page<TransferRecord> findAllByMemberId(Long memberId, int page, int pageSize) {
        Sort orders = Criteria.sortStatic("id.desc");
        PageRequest pageRequest = new PageRequest(page, pageSize, orders);
        Criteria<TransferRecord> specification = new Criteria<>();
        specification.add(Restrictions.eq("memberId", memberId, false));
        return transferRecordDao.findAll(specification, pageRequest);
    }
}
