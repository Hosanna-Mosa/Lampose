export const STATES = {
  pending_owner: {
    cls: 'is-waiting', icon: 'clock',
    title: 'Waiting for the owner to confirm',
    lead: 'We\'ve sent your request on WhatsApp. Owners usually reply within a '
        + 'few hours, and this page updates on its own.',
  },
  /* `confirmed`, not `approved`: these keys are the API's own status values
     (models/VisitRequest.js in the main backend), so a rename there has to
     land here or the card falls through to rendering nothing. */
  confirmed: {
    cls: 'is-confirmed', icon: 'verified',
    title: 'The owner says it\'s available',
    lead: 'They have your number and can arrange a time with you. You can call '
        + 'them directly using the number in the details above.',
  },
  declined: {
    cls: 'is-declined', icon: 'bell',
    title: 'Not available at the moment',
    lead: 'The owner replied that this property isn\'t free to visit right now. '
        + 'There are similar rooms below and on Explore.',
  },
  expired: {
    cls: 'is-expired', icon: 'clock',
    title: 'The owner didn\'t reply',
    lead: 'We didn\'t hear back within 24 hours. You can try the owner directly '
        + 'on the number above, or ask again.',
  },
};
