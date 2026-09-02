package io.intafaced.fix;

import java.io.InputStream;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import quickfix.ConfigError;
import quickfix.DataDictionary;
import quickfix.FixVersions;

/**
 * Official QuickFIX/J 3.0.2 XML dictionaries per version.
 * FIX.5.0 rides FIXT.1.1. Unsupported BeginString refuses.
 */
public final class FixDictionaries {
    public static final String FIX42_XML = "FIX42.xml";
    public static final String FIX44_XML = "FIX44.xml";
    public static final String FIX50_XML = "FIX50.xml";
    public static final String FIXT11_XML = "FIXT11.xml";

    private static final Map<String, DataDictionary> CACHE = new ConcurrentHashMap<>();

    private FixDictionaries() {}

    public static boolean isSupportedBeginString(String beginString) {
        return FixGatewayAdapter.SUPPORTED_BEGIN_STRINGS.contains(beginString);
    }

    public static String applicationResource(String beginString) throws ConfigError {
        return switch (beginString) {
            case FixVersions.BEGINSTRING_FIX42 -> FIX42_XML;
            case FixVersions.BEGINSTRING_FIX44 -> FIX44_XML;
            case FixVersions.FIX50, FixVersions.BEGINSTRING_FIXT11 -> FIX50_XML;
            default -> throw unsupported(beginString);
        };
    }

    public static String transportResource(String beginString) throws ConfigError {
        if (FixVersions.BEGINSTRING_FIXT11.equals(beginString) || FixVersions.FIX50.equals(beginString)) {
            return FIXT11_XML;
        }
        return applicationResource(beginString);
    }

    /** Session BeginString on the wire. FIX.5.0 uses FIXT.1.1. */
    public static String sessionBeginString(String productBegin) throws ConfigError {
        if (FixVersions.FIX50.equals(productBegin) || FixVersions.BEGINSTRING_FIXT11.equals(productBegin)) {
            return FixVersions.BEGINSTRING_FIXT11;
        }
        if (FixVersions.BEGINSTRING_FIX42.equals(productBegin) || FixVersions.BEGINSTRING_FIX44.equals(productBegin)) {
            return productBegin;
        }
        throw unsupported(productBegin);
    }

    public static DataDictionary loadOfficial(String resource) throws ConfigError {
        DataDictionary existing = CACHE.get(resource);
        if (existing != null) {
            return existing;
        }
        InputStream in = Thread.currentThread().getContextClassLoader().getResourceAsStream(resource);
        if (in == null) {
            in = FixDictionaries.class.getClassLoader().getResourceAsStream(resource);
        }
        if (in == null) {
            throw new ConfigError("official QuickFIX DataDictionary missing from classpath: " + resource);
        }
        DataDictionary dd = new DataDictionary(in);
        CACHE.put(resource, dd);
        return dd;
    }

    static ConfigError unsupported(String beginString) {
        return new ConfigError(
                "BeginString " + beginString + " is not FIX.4.2, FIX.4.4, FIX.5.0, or FIXT.1.1");
    }
}
