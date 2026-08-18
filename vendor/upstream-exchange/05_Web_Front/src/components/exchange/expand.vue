<style scoped>
.expand-row{
        margin-bottom: 8px;
    }
    td.ivu-table-expanded-cell{
        padding: 10px 50px;
    }
.expand-row.ivu-col{
        line-height: 20px;
    }
</style>
<template>
    <div>
        <Row class="expand-row" :class="skin">
            <Col span="8">
                <span class="expand-key">{{$t('exchange.expand.time')}} </span>
            </Col>
            <Col span="4">
                <span class="expand-key">{{$t('exchange.expand.price')}} </span>
            </Col>
            <Col span="4">
                <span class="expand-key">{{$t('exchange.expand.amount')}} </span>
            </Col>
            <Col span="4">
              <span class="expand-key">{{ $t("shellResidual.volume") }}</span>
            </Col>
            <Col span="4">
                <span class="expand-key">{{$t('exchange.expand.fee')}}</span>
            </Col>
        </Row>
        <Row v-for="(row, index) in rows" :key="'fill-' + index">
            <Col span="8">
                <span class="expand-value">{{ row.time|dateFormat }}</span>
            </Col>
            <Col span="4">
                <span class="expand-value">{{ moneyText(row.price) }}</span>
            </Col>
            <Col span="4">
                <span class="expand-value">{{ moneyText(row.amount) }}</span>
            </Col>
            <Col span="4">
            <span class="expand-value">{{ moneyText(row.turnover) }}</span>
            </Col>
            <Col span="4">
                <span class="expand-value">{{ moneyText(row.fee) }}</span>
            </Col>
        </Row>
    </div>
</template>
<script>
    /* Fill expand used toFloor (Number + substring). That invents digits on
       long fees/qtys. Print the venue decimal string verbatim instead. */
    export default {
        props: {
            skin:String,
            rows: Array
        },
        methods: {
            moneyText(value) {
                if (value === null || value === undefined || value === '') return '—';
                return String(value);
            }
        }
    };
</script>
