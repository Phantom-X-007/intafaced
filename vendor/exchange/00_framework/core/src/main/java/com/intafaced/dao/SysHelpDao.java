package com.intafaced.dao;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.intafaced.constant.SysHelpClassification;
import com.intafaced.dao.base.BaseDao;
import com.intafaced.entity.SysHelp;

import java.util.List;

/**
 * @author GS
 * @description
 * @date 2018/1/9 9:58
 */
public interface SysHelpDao extends BaseDao<SysHelp> {
    List<SysHelp> findAllBySysHelpClassification(SysHelpClassification sysHelpClassification);

    @Query("select max(s.sort) from SysHelp s")
    int findMaxSort();

    @Query(value = "select * from sys_help WHERE sys_help_classification=:cate and lang=:lang  and is_top='0' ",nativeQuery = true)
    List<SysHelp> getCateTop(@Param("cate") String cate,@Param("lang") String lang);

    @Query(value = "select * from sys_help WHERE sys_help_classification=:cate and lang=:lang order by sort desc limit 10",nativeQuery = true)
    List<SysHelp> getCateTopList(@Param("cate") String cate,@Param("lang") String lang);
}
