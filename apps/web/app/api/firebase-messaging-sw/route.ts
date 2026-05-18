export const dynamic = 'force-dynamic';

const FIREBASE_SERVICE_WORKER_SDK_VERSION = '10.14.1';

export function GET() {
  const config = JSON.stringify({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
  });

  const script = `
importScripts('https://www.gstatic.com/firebasejs/${FIREBASE_SERVICE_WORKER_SDK_VERSION}/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/${FIREBASE_SERVICE_WORKER_SDK_VERSION}/firebase-messaging-compat.js');

firebase.initializeApp(${config});
const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const title = payload.notification && payload.notification.title ? payload.notification.title : 'Tennis League';
  const body = payload.notification && payload.notification.body ? payload.notification.body : '';
  self.registration.showNotification(title, {
    body: body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data || {},
  });
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var data = event.notification.data || {};
  var path = '/dashboard';
  var matchTypes = ['report_submitted', 'report_disputed', 'match_accepted', 'match_proposed'];
  if (data.matchId && matchTypes.indexOf(data.type) !== -1) {
    path = '/matches/' + data.matchId;
  } else if (data.type === 'message') {
    path = '/messages';
  } else if (data.type === 'match_proposal_cancelled') {
    path = '/matches';
  }
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ('focus' in client) {
          client.navigate(path);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(path);
    })
  );
});
`;

  return new Response(script, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-store',
      'Service-Worker-Allowed': '/',
    },
  });
}
