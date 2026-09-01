/**
 * QuantLib C++ 1.43 N-API addon (lballabio/QuantLib @ pin in QUANTLIB.pin.json).
 *
 * Pricing is QuantLib::BlackCalculator. Day-count is QuantLib::DayCounter.
 * Evaluation/ledger clock is the caller's year-fraction / ISO dates — not
 * QuantLib Settings::evaluationDate as SoT.
 *
 * This file does not compile unless QuantLib 1.43 headers and lib are present.
 * The TypeScript adapter refuses when this .node is absent.
 */

#include <node_api.h>

#include <ql/instruments/payoffs.hpp>
#include <ql/pricingengines/blackcalculator.hpp>
#include <ql/time/date.hpp>
#include <ql/time/daycounters/actual365fixed.hpp>
#include <ql/time/daycounters/actual360.hpp>
#include <ql/time/daycounters/actualactual.hpp>
#include <ql/time/daycounters/thirty360.hpp>
#include <ql/time/daycounter.hpp>

#include <cmath>
#include <stdexcept>
#include <string>

std::string readString(napi_env env, napi_value value) {
  size_t len = 0;
  napi_status st = napi_get_value_string_utf8(env, value, nullptr, 0, &len);
  if (st != napi_ok) throw std::runtime_error("expected a string");
  std::string out(len, '\0');
  st = napi_get_value_string_utf8(env, value, out.data(), len + 1, &len);
  if (st != napi_ok) throw std::runtime_error("expected a string");
  return out;
}

napi_value getProp(napi_env env, napi_value obj, const char* name) {
  napi_value out;
  napi_status st = napi_get_named_property(env, obj, name, &out);
  if (st != napi_ok) throw std::runtime_error(std::string("missing ") + name);
  napi_valuetype t;
  napi_typeof(env, out, &t);
  if (t == napi_undefined || t == napi_null) {
    throw std::runtime_error(std::string("missing ") + name);
  }
  return out;
}

double parseReal(const std::string& s, const char* field) {
  try {
    size_t idx = 0;
    double v = std::stod(s, &idx);
    if (idx != s.size() || !std::isfinite(v)) {
      throw std::runtime_error(std::string(field) + " is not a finite real");
    }
    return v;
  } catch (const std::runtime_error&) {
    throw;
  } catch (...) {
    throw std::runtime_error(std::string(field) + " is not a finite real");
  }
}

QuantLib::Date parseIso(const std::string& iso, const char* field) {
  if (iso.size() != 10 || iso[4] != '-' || iso[7] != '-') {
    throw std::runtime_error(std::string(field) + " is not YYYY-MM-DD");
  }
  int y = std::stoi(iso.substr(0, 4));
  int m = std::stoi(iso.substr(5, 2));
  int d = std::stoi(iso.substr(8, 2));
  return QuantLib::Date(QuantLib::Day(d), QuantLib::Month(m), QuantLib::Year(y));
}

napi_value setNumber(napi_env env, napi_value obj, const char* name, double v) {
  napi_value num;
  if (napi_create_double(env, v, &num) != napi_ok) throw std::runtime_error("napi_create_double");
  if (napi_set_named_property(env, obj, name, num) != napi_ok) throw std::runtime_error("napi_set_named_property");
  return num;
}

napi_value throwError(napi_env env, const char* message) {
  napi_throw_error(env, nullptr, message);
  return nullptr;
}

napi_value VanillaEuropean(napi_env env, napi_callback_info info) {
  try {
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
    if (argc < 1) throw std::runtime_error("vanillaEuropean expects one object");

    const std::string right = readString(env, getProp(env, argv[0], "right"));
    const double strike = parseReal(readString(env, getProp(env, argv[0], "strike")), "strike");
    const double spot = parseReal(readString(env, getProp(env, argv[0], "spot")), "spot");
    const double vol = parseReal(readString(env, getProp(env, argv[0], "volatility")), "volatility");
    const double t = parseReal(readString(env, getProp(env, argv[0], "timeToExpiry")), "timeToExpiry");
    const double r = parseReal(readString(env, getProp(env, argv[0], "riskFreeRate")), "riskFreeRate");
    const double q = parseReal(readString(env, getProp(env, argv[0], "dividendYield")), "dividendYield");

    QuantLib::Option::Type type;
    if (right == "call") type = QuantLib::Option::Call;
    else if (right == "put") type = QuantLib::Option::Put;
    else throw std::runtime_error("right must be call or put");

    const double forward = spot * std::exp((r - q) * t);
    const double stdDev = vol * std::sqrt(t);
    const double discount = std::exp(-r * t);

    QuantLib::BlackCalculator calc(type, strike, forward, stdDev, discount);

    napi_value out;
    napi_create_object(env, &out);
    setNumber(env, out, "npv", calc.value());
    setNumber(env, out, "delta", calc.delta(spot));
    setNumber(env, out, "gamma", calc.gamma(spot));
    setNumber(env, out, "vega", calc.vega(t));
    setNumber(env, out, "theta", calc.theta(spot, t));
    return out;
  } catch (const std::exception& ex) {
    return throwError(env, ex.what());
  }
}

QuantLib::DayCounter dayCounter(const std::string& convention) {
  using namespace QuantLib;
  if (convention == "Actual365Fixed") return Actual365Fixed();
  if (convention == "Actual360") return Actual360();
  if (convention == "Thirty360") return Thirty360(Thirty360::USA);
  if (convention == "ActualActual") return ActualActual(ActualActual::ISDA);
  throw std::runtime_error("unknown day-count convention");
}

napi_value YearFraction(napi_env env, napi_callback_info info) {
  try {
    size_t argc = 1;
    napi_value argv[1];
    napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
    if (argc < 1) throw std::runtime_error("yearFraction expects one object");

    const std::string convention = readString(env, getProp(env, argv[0], "convention"));
    const std::string start = readString(env, getProp(env, argv[0], "start"));
    const std::string end = readString(env, getProp(env, argv[0], "end"));

    const QuantLib::DayCounter dc = dayCounter(convention);
    const double yf = dc.yearFraction(parseIso(start, "start"), parseIso(end, "end"));

    napi_value out;
    napi_create_double(env, yf, &out);
    return out;
  } catch (const std::exception& ex) {
    return throwError(env, ex.what());
  }
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_value vanilla;
  napi_value yf;
  napi_create_function(env, "vanillaEuropean", NAPI_AUTO_LENGTH, VanillaEuropean, nullptr, &vanilla);
  napi_create_function(env, "yearFraction", NAPI_AUTO_LENGTH, YearFraction, nullptr, &yf);
  napi_set_named_property(env, exports, "vanillaEuropean", vanilla);
  napi_set_named_property(env, exports, "yearFraction", yf);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
