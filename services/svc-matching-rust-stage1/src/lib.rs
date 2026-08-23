//! C2 `socket.rust-matching` stage 1.
//!
//! This crate is deliberately a socket, not a replacement: the TypeScript
//! engine remains the default. Stage 1 proves that its append-only journal can
//! be read by Rust and replayed into a canonical, deterministic book state.
//! Amounts stay decimal strings on the wire and are never represented as
//! floating point values.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Order {
    pub orderId: String,
    pub accountId: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub side: String,
    pub qty: String,
    pub price: Option<String>,
    pub stopPrice: Option<String>,
    pub tif: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Record {
    pub seq: u64,
    pub kind: String,
    pub marketId: String,
    pub at: String,
    pub order: Option<Order>,
    pub orderId: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RestingOrder {
    pub orderId: String,
    pub accountId: String,
    pub remaining: String,
    pub sequence: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PriceLevel {
    pub price: String,
    pub orders: Vec<RestingOrder>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BookState {
    pub marketId: String,
    pub sequence: u64,
    pub lastTradePrice: Option<String>,
    pub bids: Vec<PriceLevel>,
    pub asks: Vec<PriceLevel>,
    pub stops: Vec<serde_json::Value>,
}

#[derive(Debug, Clone)]
struct Live { order: Order, remaining: u128, sequence: u64 }

#[derive(Debug, Default)]
struct Book { market: String, sequence: u64, last: Option<u128>, bids: Vec<Live>, asks: Vec<Live> }

const SCALE: u32 = 18;

fn parse_amount(s: &str) -> Result<u128, String> {
    let (whole, frac) = s.split_once('.').unwrap_or((s, ""));
    if whole.is_empty() || frac.len() > SCALE as usize || !whole.chars().all(|c| c.is_ascii_digit()) || !frac.chars().all(|c| c.is_ascii_digit()) {
        return Err(format!("invalid decimal amount: {s}"));
    }
    let mut digits = frac.to_owned();
    digits.extend(std::iter::repeat('0').take(SCALE as usize - digits.len()));
    let w = whole.parse::<u128>().map_err(|_| format!("amount overflow: {s}"))?;
    let f = if digits.is_empty() { 0 } else { digits.parse::<u128>().map_err(|_| format!("amount overflow: {s}"))? };
    w.checked_mul(10u128.pow(SCALE)).and_then(|x| x.checked_add(f)).ok_or_else(|| format!("amount overflow: {s}"))
}

fn format_amount(v: u128) -> String {
    let unit = 10u128.pow(SCALE);
    let whole = v / unit;
    let frac = format!("{:018}", v % unit).trim_end_matches('0').to_owned();
    if frac.is_empty() { whole.to_string() } else { format!("{whole}.{frac}") }
}

impl Book {
    fn submit(&mut self, order: Order) -> Result<(), String> {
        let qty = parse_amount(&order.qty)?;
        let price = order.price.as_deref().ok_or_else(|| "stage 1 accepts limit orders only".to_string()).and_then(parse_amount)?;
        let side = order.side.as_str();
        let opposite = if side == "buy" { &mut self.asks } else if side == "sell" { &mut self.bids } else { return Err(format!("invalid side: {side}")); };
        let crossing = |p: u128| if side == "buy" { price >= p } else { price <= p };
        let mut remaining = qty;
        while remaining > 0 && !opposite.is_empty() && crossing(parse_amount(opposite[0].order.price.as_ref().unwrap()).unwrap()) {
            let maker_price = parse_amount(opposite[0].order.price.as_ref().unwrap()).unwrap();
            let traded = remaining.min(opposite[0].remaining);
            remaining -= traded;
            opposite[0].remaining -= traded;
            self.last = Some(maker_price);
            self.sequence += 1;
            if opposite[0].remaining == 0 { opposite.remove(0); }
        }
        self.sequence += 1;
        if remaining > 0 && order.tif != "IOC" && order.tif != "FOK" {
            let live = Live { order, remaining, sequence: self.sequence };
            let own = if side == "buy" { &mut self.bids } else { &mut self.asks };
            own.push(live);
            own.sort_by(|a, b| {
                let pa = parse_amount(a.order.price.as_ref().unwrap()).unwrap();
                let pb = parse_amount(b.order.price.as_ref().unwrap()).unwrap();
                if side == "buy" { pb.cmp(&pa).then(a.sequence.cmp(&b.sequence)) } else { pa.cmp(&pb).then(a.sequence.cmp(&b.sequence)) }
            });
        }
        Ok(())
    }
    fn cancel(&mut self, id: &str) { self.bids.retain(|x| x.order.orderId != id); self.asks.retain(|x| x.order.orderId != id); self.sequence += 1; }
    fn state(&self) -> BookState {
        let levels = |orders: &[Live], side: &str| {
            let mut grouped: BTreeMap<u128, Vec<RestingOrder>> = BTreeMap::new();
            for x in orders { let p = parse_amount(x.order.price.as_ref().unwrap()).unwrap(); grouped.entry(p).or_default().push(RestingOrder { orderId: x.order.orderId.clone(), accountId: x.order.accountId.clone(), remaining: format_amount(x.remaining), sequence: x.sequence }); }
            let mut out: Vec<_> = grouped.into_iter().map(|(p, orders)| PriceLevel { price: format_amount(p), orders }).collect();
            if side == "buy" { out.reverse(); } out
        };
        BookState { marketId: self.market.clone(), sequence: self.sequence, lastTradePrice: self.last.map(format_amount), bids: levels(&self.bids, "buy"), asks: levels(&self.asks, "sell"), stops: vec![] }
    }
}

/// Replay a JSON array of the TypeScript engine's journal records.
pub fn replay(records: &[Record]) -> Result<String, String> {
    let mut books: BTreeMap<String, Book> = BTreeMap::new();
    for record in records {
        match record.kind.as_str() {
            "submit" => { let order = record.order.clone().ok_or_else(|| "submit without order".to_string())?; let book = books.entry(record.marketId.clone()).or_insert_with(|| Book { market: record.marketId.clone(), ..Default::default() }); book.submit(order)?; }
            "cancel" => { if let Some(book) = books.get_mut(&record.marketId) { if let Some(id) = &record.orderId { book.cancel(id); } } }
            other => return Err(format!("unknown journal command: {other}")),
        }
    }
    let states: Vec<_> = books.values().map(Book::state).collect();
    serde_json::to_string(&states).map_err(|e| e.to_string())
}

pub fn replay_json(input: &str) -> Result<String, String> { let records: Vec<Record> = serde_json::from_str(input).map_err(|e| e.to_string())?; replay(&records) }

pub fn ready() -> &'static str { "ready" }

#[cfg(test)]
mod tests {
    use super::*;
    const FIXTURE: &str = include_str!("../fixtures/replay-golden.json");
    const GOLDEN: &str = include_str!("../fixtures/replay-golden.expected.json");

    #[test]
    fn replay_is_byte_identical_and_matches_golden() {
        let first = replay_json(FIXTURE).unwrap();
        let second = replay_json(FIXTURE).unwrap();
        assert_eq!(first, second);
        assert_eq!(first, GOLDEN.trim());
    }

    #[test]
    fn ready_harness_is_explicit() { assert_eq!(ready(), "ready"); }
}
