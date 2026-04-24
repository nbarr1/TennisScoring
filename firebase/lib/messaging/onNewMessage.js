"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onNewMessage = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const firestore_1 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const app_1 = require("firebase-admin/app");
if (!(0, app_1.getApps)().length)
    (0, app_1.initializeApp)();
exports.onNewMessage = functions.firestore.onDocumentCreated('channels/{channelId}/messages/{messageId}', async (event) => {
    const message = event.data?.data();
    if (!message)
        return;
    const db = (0, firestore_1.getFirestore)();
    const channelSnap = await db.collection('channels').doc(event.params.channelId).get();
    const channel = channelSnap.data();
    if (!channel)
        return;
    // Update channel's lastMessage
    await channelSnap.ref.update({
        lastMessage: {
            content: message.content,
            senderId: message.senderId,
            senderName: message.senderName,
            timestamp: message.createdAt,
        },
    });
    // Notify all participants except the sender
    const recipientIds = channel.participantIds.filter((id) => id !== message.senderId);
    if (recipientIds.length === 0)
        return;
    const userSnaps = await Promise.all(recipientIds.map((id) => db.collection('users').doc(id).get()));
    const tokens = [];
    for (const snap of userSnaps) {
        const user = snap.data();
        if (user?.fcmTokens?.length) {
            tokens.push(...user.fcmTokens);
        }
    }
    if (tokens.length === 0)
        return;
    await (0, messaging_1.getMessaging)().sendEachForMulticast({
        tokens,
        notification: {
            title: message.senderName,
            body: message.content.length > 100 ? message.content.slice(0, 97) + '...' : message.content,
        },
        data: {
            type: 'message',
            channelId: event.params.channelId,
            messageId: event.params.messageId,
        },
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });
});
//# sourceMappingURL=onNewMessage.js.map