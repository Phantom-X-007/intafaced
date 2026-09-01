package io.intafaced.sbe;

import java.math.BigInteger;

/**
 * Decimal-string ↔ SBE mantissa/exponent. No IEEE, no BigDecimal float path.
 */
public final class DecimalCodec {
    private static final BigInteger MIN_MANTISSA = BigInteger.valueOf(Long.MIN_VALUE);
    private static final BigInteger MAX_MANTISSA = BigInteger.valueOf(Long.MAX_VALUE);

    public final long mantissa;
    public final byte exponent;

    public DecimalCodec(long mantissa, byte exponent) {
        this.mantissa = mantissa;
        this.exponent = exponent;
    }

    public static DecimalCodec parse(String raw) {
        if (raw == null) {
            throw new IllegalArgumentException("decimal is missing");
        }
        String s = raw.trim();
        if (s.isEmpty()) {
            throw new IllegalArgumentException("decimal is blank");
        }
        if (s.indexOf('e') >= 0 || s.indexOf('E') >= 0) {
            throw new IllegalArgumentException("decimal must not use exponent notation");
        }
        boolean neg = s.charAt(0) == '-';
        if (neg) {
            s = s.substring(1);
            if (s.isEmpty()) {
                throw new IllegalArgumentException("decimal is not a signed decimal string");
            }
        }
        if (s.charAt(0) == '+') {
            throw new IllegalArgumentException("decimal must not use a leading plus");
        }
        int dot = s.indexOf('.');
        String whole;
        String frac;
        if (dot < 0) {
            whole = s;
            frac = "";
        } else {
            if (s.indexOf('.', dot + 1) >= 0) {
                throw new IllegalArgumentException("decimal has multiple dots");
            }
            whole = s.substring(0, dot);
            frac = s.substring(dot + 1);
        }
        if (whole.isEmpty() || !allDigits(whole) || !allDigits(frac)) {
            throw new IllegalArgumentException("decimal is not a signed decimal string");
        }
        if (whole.length() > 1 && whole.charAt(0) == '0') {
            throw new IllegalArgumentException("decimal has a leading zero");
        }
        String digits = whole + frac;
        int scale = frac.length();
        int end = digits.length();
        while (scale > 0 && end > 1 && digits.charAt(end - 1) == '0') {
            end--;
            scale--;
        }
        digits = digits.substring(0, end);
        if (digits.isEmpty()) {
            digits = "0";
            scale = 0;
        }
        BigInteger mag = new BigInteger(digits);
        if (neg && mag.signum() != 0) {
            mag = mag.negate();
        }
        if (mag.compareTo(MIN_MANTISSA) < 0 || mag.compareTo(MAX_MANTISSA) > 0) {
            throw new IllegalArgumentException("decimal mantissa does not fit int64");
        }
        if (scale > 127) {
            throw new IllegalArgumentException("decimal exponent does not fit int8");
        }
        return new DecimalCodec(mag.longValueExact(), (byte) -scale);
    }

    public String format() {
        if (mantissa == 0) {
            return "0";
        }
        boolean neg = mantissa < 0;
        BigInteger mag = BigInteger.valueOf(mantissa).abs();
        if (exponent >= 0) {
            String whole = mag.multiply(BigInteger.TEN.pow(exponent)).toString();
            return neg ? "-" + whole : whole;
        }
        int scale = -exponent;
        String digits = mag.toString();
        if (digits.length() <= scale) {
            digits = "0".repeat(scale - digits.length() + 1) + digits;
        }
        int cut = digits.length() - scale;
        String whole = digits.substring(0, cut);
        String frac = digits.substring(cut).replaceFirst("0+$", "");
        String out = frac.isEmpty() ? whole : whole + "." + frac;
        return neg ? "-" + out : out;
    }

    private static boolean allDigits(String s) {
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c < '0' || c > '9') {
                return false;
            }
        }
        return true;
    }
}
