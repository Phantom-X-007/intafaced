/* Generated SBE (Simple Binary Encoding) message codec. */
package io.intafaced.sbe.md;

import org.agrona.MutableDirectBuffer;


/**
 * Exact decimal: mantissa × 10^exponent. Never IEEE.
 */
@SuppressWarnings("all")
public final class DecimalEncodingEncoder
{
    public static final int SCHEMA_ID = 101;
    public static final int SCHEMA_VERSION = 0;
    public static final String SEMANTIC_VERSION = "1.0.0";
    public static final int ENCODED_LENGTH = 9;
    public static final java.nio.ByteOrder BYTE_ORDER = java.nio.ByteOrder.LITTLE_ENDIAN;

    private int offset;
    private MutableDirectBuffer buffer;

    public DecimalEncodingEncoder wrap(final MutableDirectBuffer buffer, final int offset)
    {
        if (buffer != this.buffer)
        {
            this.buffer = buffer;
        }
        this.offset = offset;

        return this;
    }

    public MutableDirectBuffer buffer()
    {
        return buffer;
    }

    public int offset()
    {
        return offset;
    }

    public int encodedLength()
    {
        return ENCODED_LENGTH;
    }

    public int sbeSchemaId()
    {
        return SCHEMA_ID;
    }

    public int sbeSchemaVersion()
    {
        return SCHEMA_VERSION;
    }

    public static int mantissaEncodingOffset()
    {
        return 0;
    }

    public static int mantissaEncodingLength()
    {
        return 8;
    }

    public static long mantissaNullValue()
    {
        return -9223372036854775808L;
    }

    public static long mantissaMinValue()
    {
        return -9223372036854775807L;
    }

    public static long mantissaMaxValue()
    {
        return 9223372036854775807L;
    }

    public DecimalEncodingEncoder mantissa(final long value)
    {
        buffer.putLong(offset + 0, value, BYTE_ORDER);
        return this;
    }


    public static int exponentEncodingOffset()
    {
        return 8;
    }

    public static int exponentEncodingLength()
    {
        return 1;
    }

    public static byte exponentNullValue()
    {
        return (byte)-128;
    }

    public static byte exponentMinValue()
    {
        return (byte)-127;
    }

    public static byte exponentMaxValue()
    {
        return (byte)127;
    }

    public DecimalEncodingEncoder exponent(final byte value)
    {
        buffer.putByte(offset + 8, value);
        return this;
    }


    public String toString()
    {
        if (null == buffer)
        {
            return "";
        }

        return appendTo(new StringBuilder()).toString();
    }

    public StringBuilder appendTo(final StringBuilder builder)
    {
        if (null == buffer)
        {
            return builder;
        }

        final DecimalEncodingDecoder decoder = new DecimalEncodingDecoder();
        decoder.wrap(buffer, offset);

        return decoder.appendTo(builder);
    }
}
