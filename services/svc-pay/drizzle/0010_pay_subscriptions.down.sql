-- Reverse 0010_pay_subscriptions — drop in dependency order.

DROP TABLE IF EXISTS pay.subscription_executions;
DROP TABLE IF EXISTS pay.subscriptions;
DROP TABLE IF EXISTS pay.subscription_mandates;

DROP TYPE IF EXISTS pay.subscription_execution_status;
DROP TYPE IF EXISTS pay.subscription_status;
DROP TYPE IF EXISTS pay.mandate_status;
DROP TYPE IF EXISTS pay.subscription_cadence;
