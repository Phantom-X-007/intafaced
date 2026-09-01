/* Generated SBE (Simple Binary Encoding) message codec. */
package io.intafaced.sbe.md;

import org.agrona.MutableDirectBuffer;


/**
 * Tiny public depth level
 */
@SuppressWarnings("all")
public final class DepthLevelEncoder
{
    public static final int BLOCK_LENGTH = 51;
    public static final int TEMPLATE_ID = 2;
    public static final int SCHEMA_ID = 101;
    public static final int SCHEMA_VERSION = 0;
    public static final String SEMANTIC_VERSION = "1.0.0";
    public static final java.nio.ByteOrder BYTE_ORDER = java.nio.ByteOrder.LITTLE_ENDIAN;

    private final DepthLevelEncoder parentMessage = this;
    private MutableDirectBuffer buffer;
    private int offset;
    private int limit;

    public int sbeBlockLength()
    {
        return BLOCK_LENGTH;
    }

    public int sbeTemplateId()
    {
        return TEMPLATE_ID;
    }

    public int sbeSchemaId()
    {
        return SCHEMA_ID;
    }

    public int sbeSchemaVersion()
    {
        return SCHEMA_VERSION;
    }

    public String sbeSemanticType()
    {
        return "";
    }

    public MutableDirectBuffer buffer()
    {
        return buffer;
    }

    public int offset()
    {
        return offset;
    }

    public DepthLevelEncoder wrap(final MutableDirectBuffer buffer, final int offset)
    {
        if (buffer != this.buffer)
        {
            this.buffer = buffer;
        }
        this.offset = offset;
        limit(offset + BLOCK_LENGTH);

        return this;
    }

    public DepthLevelEncoder wrapAndApplyHeader(
        final MutableDirectBuffer buffer, final int offset, final MessageHeaderEncoder headerEncoder)
    {
        headerEncoder
            .wrap(buffer, offset)
            .blockLength(BLOCK_LENGTH)
            .templateId(TEMPLATE_ID)
            .schemaId(SCHEMA_ID)
            .version(SCHEMA_VERSION);

        return wrap(buffer, offset + MessageHeaderEncoder.ENCODED_LENGTH);
    }

    public int encodedLength()
    {
        return limit - offset;
    }

    public int limit()
    {
        return limit;
    }

    public void limit(final int limit)
    {
        this.limit = limit;
    }

    public static int instrumentId()
    {
        return 10;
    }

    public static int instrumentSinceVersion()
    {
        return 0;
    }

    public static int instrumentEncodingOffset()
    {
        return 0;
    }

    public static int instrumentEncodingLength()
    {
        return 16;
    }

    public static String instrumentMetaAttribute(final MetaAttribute metaAttribute)
    {
        if (MetaAttribute.PRESENCE == metaAttribute)
        {
            return "required";
        }

        return "";
    }

    public static byte instrumentNullValue()
    {
        return (byte)0;
    }

    public static byte instrumentMinValue()
    {
        return (byte)32;
    }

    public static byte instrumentMaxValue()
    {
        return (byte)126;
    }

    public static int instrumentLength()
    {
        return 16;
    }


    public DepthLevelEncoder instrument(final int index, final byte value)
    {
        if (index < 0 || index >= 16)
        {
            throw new IndexOutOfBoundsException("index out of range: index=" + index);
        }

        final int pos = offset + 0 + (index * 1);
        buffer.putByte(pos, value);

        return this;
    }

    public static String instrumentCharacterEncoding()
    {
        return java.nio.charset.StandardCharsets.US_ASCII.name();
    }

    public DepthLevelEncoder putInstrument(final byte[] src, final int srcOffset)
    {
        final int length = 16;
        if (srcOffset < 0 || srcOffset > (src.length - length))
        {
            throw new IndexOutOfBoundsException("Copy will go out of range: offset=" + srcOffset);
        }

        buffer.putBytes(offset + 0, src, srcOffset, length);

        return this;
    }

    public DepthLevelEncoder instrument(final String src)
    {
        final int length = 16;
        final int srcLength = null == src ? 0 : src.length();
        if (srcLength > length)
        {
            throw new IndexOutOfBoundsException("String too large for copy: byte length=" + srcLength);
        }

        buffer.putStringWithoutLengthAscii(offset + 0, src);

        for (int start = srcLength; start < length; ++start)
        {
            buffer.putByte(offset + 0 + start, (byte)0);
        }

        return this;
    }

    public DepthLevelEncoder instrument(final CharSequence src)
    {
        final int length = 16;
        final int srcLength = null == src ? 0 : src.length();
        if (srcLength > length)
        {
            throw new IndexOutOfBoundsException("CharSequence too large for copy: byte length=" + srcLength);
        }

        buffer.putStringWithoutLengthAscii(offset + 0, src);

        for (int start = srcLength; start < length; ++start)
        {
            buffer.putByte(offset + 0 + start, (byte)0);
        }

        return this;
    }

    public static int sequenceId()
    {
        return 11;
    }

    public static int sequenceSinceVersion()
    {
        return 0;
    }

    public static int sequenceEncodingOffset()
    {
        return 16;
    }

    public static int sequenceEncodingLength()
    {
        return 8;
    }

    public static String sequenceMetaAttribute(final MetaAttribute metaAttribute)
    {
        if (MetaAttribute.PRESENCE == metaAttribute)
        {
            return "required";
        }

        return "";
    }

    public static long sequenceNullValue()
    {
        return 0xffffffffffffffffL;
    }

    public static long sequenceMinValue()
    {
        return 0x0L;
    }

    public static long sequenceMaxValue()
    {
        return 0xfffffffffffffffeL;
    }

    public DepthLevelEncoder sequence(final long value)
    {
        buffer.putLong(offset + 16, value, BYTE_ORDER);
        return this;
    }


    public static int sideId()
    {
        return 12;
    }

    public static int sideSinceVersion()
    {
        return 0;
    }

    public static int sideEncodingOffset()
    {
        return 24;
    }

    public static int sideEncodingLength()
    {
        return 1;
    }

    public static String sideMetaAttribute(final MetaAttribute metaAttribute)
    {
        if (MetaAttribute.PRESENCE == metaAttribute)
        {
            return "required";
        }

        return "";
    }

    public DepthLevelEncoder side(final Side value)
    {
        buffer.putByte(offset + 24, (byte)value.value());
        return this;
    }

    public static int priceId()
    {
        return 13;
    }

    public static int priceSinceVersion()
    {
        return 0;
    }

    public static int priceEncodingOffset()
    {
        return 25;
    }

    public static int priceEncodingLength()
    {
        return 9;
    }

    public static String priceMetaAttribute(final MetaAttribute metaAttribute)
    {
        if (MetaAttribute.PRESENCE == metaAttribute)
        {
            return "required";
        }

        return "";
    }

    private final DecimalEncodingEncoder price = new DecimalEncodingEncoder();

    public DecimalEncodingEncoder price()
    {
        price.wrap(buffer, offset + 25);
        return price;
    }

    public static int qtyId()
    {
        return 14;
    }

    public static int qtySinceVersion()
    {
        return 0;
    }

    public static int qtyEncodingOffset()
    {
        return 34;
    }

    public static int qtyEncodingLength()
    {
        return 9;
    }

    public static String qtyMetaAttribute(final MetaAttribute metaAttribute)
    {
        if (MetaAttribute.PRESENCE == metaAttribute)
        {
            return "required";
        }

        return "";
    }

    private final DecimalEncodingEncoder qty = new DecimalEncodingEncoder();

    public DecimalEncodingEncoder qty()
    {
        qty.wrap(buffer, offset + 34);
        return qty;
    }

    public static int eventTimeNsId()
    {
        return 15;
    }

    public static int eventTimeNsSinceVersion()
    {
        return 0;
    }

    public static int eventTimeNsEncodingOffset()
    {
        return 43;
    }

    public static int eventTimeNsEncodingLength()
    {
        return 8;
    }

    public static String eventTimeNsMetaAttribute(final MetaAttribute metaAttribute)
    {
        if (MetaAttribute.PRESENCE == metaAttribute)
        {
            return "required";
        }

        return "";
    }

    public static long eventTimeNsNullValue()
    {
        return 0xffffffffffffffffL;
    }

    public static long eventTimeNsMinValue()
    {
        return 0x0L;
    }

    public static long eventTimeNsMaxValue()
    {
        return 0xfffffffffffffffeL;
    }

    public DepthLevelEncoder eventTimeNs(final long value)
    {
        buffer.putLong(offset + 43, value, BYTE_ORDER);
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

        final DepthLevelDecoder decoder = new DepthLevelDecoder();
        decoder.wrap(buffer, offset, BLOCK_LENGTH, SCHEMA_VERSION);

        return decoder.appendTo(builder);
    }
}
