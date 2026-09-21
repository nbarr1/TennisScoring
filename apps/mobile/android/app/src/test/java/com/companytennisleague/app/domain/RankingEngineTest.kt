package com.companytennisleague.app.domain
import org.junit.Assert.assertEquals
import org.junit.Test
class RankingEngineTest {
 @Test fun ordersByTotalsThenHeadToHeadThenName() { val a=RankingInput("a","Ada","d","s",2,0,4,0,24,10); val b=a.copy(userId="b",displayName="Bea"); val ranked=RankingEngine.compute(listOf(a,b),listOf(HeadToHead("a","b",1,0)),123); assertEquals(listOf("a","b"),ranked.map{it.input.userId}); assertEquals(listOf(1,2),ranked.map{it.rank}); assertEquals(123,ranked[0].updatedAt) }
}
