export const PRIVACY_POLICY_LAST_UPDATED = '2026-08-14';

export const PRIVACY_POLICY_INTRO =
  'Tennis League is used to run a company tennis league across web and mobile: joining a ' +
  'division, proposing and scoring matches, viewing rankings, and messaging other players in ' +
  "your division. This policy explains what data the app collects, why, and how you can " +
  'control or delete it.';

export interface PrivacyPolicySection {
  title: string;
  body: string;
}

export const PRIVACY_POLICY_SECTIONS: PrivacyPolicySection[] = [
  {
    title: 'Information we collect',
    body:
      'Account information: email address and display name, collected when you sign up with ' +
      'email and password.\n\n' +
      'Phone number: optional, only if you choose to add it to your profile.\n\n' +
      'League activity: the division you belong to, matches you propose, schedule, and score, ' +
      'your rankings, and your weekly availability.\n\n' +
      'Match statistics: optional advanced stats (aces, winners, unforced errors, break ' +
      'points) you can choose to track while scoring a match.\n\n' +
      'Match reports: a PDF summary generated for each completed match, stored in Cloud ' +
      'Storage and accessible via a link from the match screen.\n\n' +
      "Messages: text you send in the app's in-app chat with other members of your division. " +
      'If you use "Share Contact," your phone number and email address are sent as a chat ' +
      'message to the other participant(s) in that conversation.\n\n' +
      'Feedback: any text you submit through the in-app or web Feedback form. Feedback is ' +
      "relayed to a GitHub issue tracker maintained by the league's developers.\n\n" +
      'Push notification token: a device token used to deliver push notifications (e.g. new ' +
      'matches, messages) to your device.\n\n' +
      'Avatar: an optional profile picture field exists, but the app does not currently ' +
      'provide a way to upload one, and does not access your camera or photo library.',
  },
  {
    title: 'How we use this information',
    body:
      'We use your information solely to operate the league: authenticating you, matching you ' +
      'with your division, syncing match/ranking/message data in real time across web and ' +
      'mobile, delivering push notifications, and letting you communicate with other players ' +
      'in your division. We do not use your data for advertising, and we do not sell or share ' +
      'your personal data with third parties for their own marketing purposes.',
  },
  {
    title: 'Third-party services',
    body:
      'The app is built on Google Firebase, which acts as our data processor: Firebase ' +
      'Authentication (sign-in), Cloud Firestore (profile, division, match, ranking, and ' +
      'message data, synced in real time), Cloud Storage (PDF match reports), Firebase Cloud ' +
      'Messaging (push notifications), and Cloud Functions (feedback submission, invites, and ' +
      'ranking calculations).\n\n' +
      'When you submit feedback, its text is relayed to GitHub as a sub-processor, where it is ' +
      "tracked as an issue visible to the league's developers.\n\n" +
      'We do not integrate any advertising or analytics SDKs, and the app does not use the ' +
      'Advertising ID.',
  },
  {
    title: 'Data retention and deletion',
    body:
      'Your data is retained while your account is active. You can permanently delete your ' +
      'account and personal data at any time from Profile → Delete Account. This removes your ' +
      'account record and profile from our systems and your identifying details from your ' +
      'division roster. Match and ranking records that are jointly owned with other players ' +
      '(e.g., a match you played against someone else) may be retained in anonymized form so ' +
      "other players' history and standings stay accurate.\n\n" +
      'You can also sign out at any time without deleting your data.',
  },
  {
    title: 'User-generated content',
    body:
      "Messages sent in the app's chat are visible to other members of the relevant division " +
      'or conversation. You can report an abusive or inappropriate message, or block another ' +
      "user, directly from the chat screen. Reports are reviewed by your division's leaders/" +
      'admins, who can remove reported messages.',
  },
  {
    title: 'Wearable companions',
    body:
      'The Apple Watch and Wear OS companion apps only relay the live score of a match ' +
      'currently being scored, directly between your phone and the paired watch. No ' +
      'additional data is collected on the watch.',
  },
  {
    title: 'Security',
    body:
      'Data in transit to and from Firebase is encrypted (HTTPS/TLS). Access to your ' +
      "division's data is limited to members of that division.",
  },
  {
    title: "Children's privacy",
    body:
      'Tennis League is intended for adult company-league use and is not directed at children ' +
      'under 13.',
  },
  {
    title: 'Changes to this policy',
    body:
      'We may update this policy as the app changes. The "Last updated" date above reflects ' +
      'the latest revision.',
  },
  {
    title: 'Contact us',
    body:
      'Questions about this policy or requests regarding your data can be sent through the ' +
      "in-app or web Feedback form, or to your division's league administrator.",
  },
];
