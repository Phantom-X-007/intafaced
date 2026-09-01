/* Generated SBE (Simple Binary Encoding) message codec. */
package io.intafaced.sbe.md;

import org.agrona.DirectBuffer;


/**
 * Tiny public depth level
 */
@SuppressWarnings("all")
public final class DepthLevelDecoder
{
    public static final int BLOCK_LENGTH = 51;
    public static final int TEMPLATE_ID = 2;
    public static final int SCHEMA_ID = 101;
    public static final int SCHEMA_VERSION = 0;
    public static final String SEMANTIC_VERSION = "1.0.0";
    public static final java.nio.ByteOrder BYTE_ORDER = java.nio.ByteOrder.LITTLE_ENDIAN;

    private final DepthLevelDecoder parentMessage = this;
    private DirectBuffer buffer;
    private int offset;
    private int limit;
    int actingBlockLength;
    int actingVersion;

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

    public DirectBuffer buffer()
    {
        return buffer;
    }

    public int offset()
    {
        return offset;
    }

    public DepthLevelDecoder wrap(
        final DirectBuffer buffer,
        final int offset,
        final int actingBlockLength,
        final int actingVersion)
    {
        if (buffer != this.buffer)
        {
            this.buffer = buffer;
        }
        this.offset = offset;
        this.actingBlockLength = actingBlockLength;
        this.actingVersion = actingVersion;
        limit(offset + actingBlockLength);

        return this;
    }

    public DepthLevelDecoder wrapAndApplyHeader(
        final DirectBuffer buffer,
        final int offset,
        final MessageHeaderDecoder headerDecoder)
    {
        headerDecoder.wrap(buffer, offset);

        final int templateId = headerDecoder.templateId();
        if (TEMPLATE_ID != templateId)
        {
            throw new IllegalStateException("Invalid TEMPLATE_ID: " + templateId);
        }

        return wrap(
            buffer,
            offset + MessageHeaderDecoder.ENCODED_LENGTH,
            headerDecoder.blockLength(),
            headerDecoder.version());
    }

    public DepthLevelDecoder sbeRewind()
    {
        return wrap(buffer, offset, actingBlockLength, actingVersion);
    }

    public int sbeDecodedLength()
    {
        final int currentLimit = limit();
        sbeSkip();
        final int decodedLength = encodedLength();
        limit(currentLimit);

        return decodedLength;
    }

    public int actingVersion()
    {
        return actingVersion;
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


    public byte instrument(final int index)
    {
        if (index < 0 || index >= 16)
        {
            throw new IndexOutOfBoundsException("index out of range: index=" + index);
        }

        final int pos = offset + 0 + (index * 1);

        return buffer.getByte(pos);
    }


    public static String instrumentCharacterEncoding()
    {
        return java.nio.charset.StandardCharsets.US_ASCII.name();
    }

    public int getInstrument(final byte[] dst, final int dstOffset)
    {
        final int length = 16;
        if (dstOffset < 0 || dstOffset > (dst.length - length))
        {
            throw new IndexOutOfBoundsException("Copy will go out of range: offset=" + dstOffset);
        }

        buffer.getBytes(offset + 0, dst, dstOffset, length);

        return length;
    }

    public String instrument()
    {
        final byte[] dst = new byte[16];
        buffer.getBytes(offset + 0, dst, 0, 16);

        int end = 0;
        for (; end < 16 && dst[end] != 0; ++end);

        return new String(dst, 0, end, java.nio.charset.StandardCharsets.US_ASCII);
    }


    public int getInstrument(final Appendable value)
    {
        for (int i = 0; i < 16; ++i)
        {
            final int c = buffer.getByte(offset + 0 + i) & 0xFF;
            if (c == 0)
            {
                return i;
            }

            try
            {
                value.append(c > 127 ? '?' : (char)c);
            }
            catch (final java.io.IOException ex)
            {
                throw new java.io.UncheckedIOException(ex);
            }
        }

        return 16;
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

    public long sequence()
    {
        return buffer.getLong(offset + 16, BYTE_ORDER);
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

    public short sideRaw()
    {
        return ((short)(buffer.getByte(offset + 24) & 0xFF));
    }

    public Side side()
    {
        return Side.get(((short)(buffer.getByte(offset + 24) & 0xFF)));
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

    private final DecimalEncodingDecoder price = new DecimalEncodingDecoder();

    public DecimalEncodingDecoder price()
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

    private final DecimalEncodingDecoder qty = new DecimalEncodingDecoder();

    public DecimalEncodingDecoder qty()
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

    public long eventTimeNs()
    {
        return buffer.getLong(offset + 43, BYTE_ORDER);
    }


    public String toString()
    {
        if (null == buffer)
        {
            return "";
        }

        final DepthLevelDecoder decoder = new DepthLevelDecoder();
        decoder.wrap(buffer, offset, actingBlockLength, actingVersion);

        return decoder.appendTo(new StringBuilder()).toString();
    }

    public StringBuilder appendTo(final StringBuilder builder)
    {
        if (null == buffer)
        {
            return builder;
        }

        final int originalLimit = limit();
        limit(offset + actingBlockLength);
        builder.append("[DepthLevel](sbeTemplateId=");
        builder.append(TEMPLATE_ID);
        builder.append("|sbeSchemaId=");
        builder.append(SCHEMA_ID);
        builder.append("|sbeSchemaVersion=");
        if (parentMessage.actingVersion != SCHEMA_VERSION)
        {
            builder.append(parentMessage.actingVersion);
            builder.append('/');
        }
        builder.append(SCHEMA_VERSION);
        builder.append("|sbeBlockLength=");
        if (actingBlockLength != BLOCK_LENGTH)
        {
            builder.append(actingBlockLength);
            builder.append('/');
        }
        builder.append(BLOCK_LENGTH);
        builder.append("):");
        builder.append("instrument=");
        for (int i = 0; i < instrumentLength() && this.instrument(i) > 0; i++)
        {
            builder.append((char)this.instrument(i));
        }
        builder.append('|');
        builder.append("sequence=");
        builder.append(this.sequence());
        builder.append('|');
        builder.append("side=");
        builder.append(this.side());
        builder.append('|');
        builder.append("price=");
        final DecimalEncodingDecoder price = this.price();
        if (null != price)
        {
            price.appendTo(builder);
        }
        else
        {
            builder.append("null");
        }
        builder.append('|');
        builder.append("qty=");
        final DecimalEncodingDecoder qty = this.qty();
        if (null != qty)
        {
            qty.appendTo(builder);
        }
        else
        {
            builder.append("null");
        }
        builder.append('|');
        builder.append("eventTimeNs=");
        builder.append(this.eventTimeNs());

        limit(originalLimit);

        return builder;
    }
    
    public DepthLevelDecoder sbeSkip()
    {
        sbeRewind();

        return this;
    }
}
