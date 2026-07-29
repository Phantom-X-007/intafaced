package com.intafaced.handler;

import com.intafaced.entity.ChatMessageRecord;
import com.intafaced.entity.HistoryChatMessage;
import com.intafaced.entity.HistoryMessagePage;

public interface MessageHandler {

    void handleMessage(ChatMessageRecord message);

    HistoryMessagePage getHistoryMessage(HistoryChatMessage message);
}
