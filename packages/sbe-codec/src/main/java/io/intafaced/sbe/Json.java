package io.intafaced.sbe;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class Json {
    private static final Pattern STRING_FIELD = Pattern.compile("\"([A-Za-z][A-Za-z0-9]*)\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"");

    private Json() {}

    static String string(String value) {
        StringBuilder sb = new StringBuilder(value.length() + 2);
        sb.append('"');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '\\' -> sb.append("\\\\");
                case '"' -> sb.append("\\\"");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> sb.append(c);
            }
        }
        sb.append('"');
        return sb.toString();
    }

    static Map<String, String> objectOfStrings(String json) {
        if (json == null || json.isBlank()) {
            throw new IllegalArgumentException("json is missing");
        }
        String trimmed = json.trim();
        if (trimmed.indexOf('[') >= 0) {
            throw new IllegalArgumentException("json arrays are not accepted");
        }
        if (Pattern.compile("\"[A-Za-z][A-Za-z0-9]*\"\\s*:\\s*-?\\d").matcher(trimmed).find()) {
            throw new IllegalArgumentException("json numbers are refused — qty/price/ids are decimal strings");
        }
        Map<String, String> out = new LinkedHashMap<>();
        Matcher m = STRING_FIELD.matcher(trimmed);
        while (m.find()) {
            out.put(m.group(1), unescape(m.group(2)));
        }
        return out;
    }

    private static String unescape(String s) {
        return s.replace("\\\"", "\"").replace("\\\\", "\\");
    }
}
