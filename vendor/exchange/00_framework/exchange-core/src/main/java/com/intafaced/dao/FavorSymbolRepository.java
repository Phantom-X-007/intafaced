package com.intafaced.dao;

import org.springframework.data.jpa.repository.JpaRepository;

import com.intafaced.entity.FavorSymbol;

import java.util.List;

public interface FavorSymbolRepository extends JpaRepository<FavorSymbol,Long>{
    FavorSymbol findByMemberIdAndSymbol(Long memberId,String symbol);
    List<FavorSymbol> findAllByMemberId(Long memberId);
}
