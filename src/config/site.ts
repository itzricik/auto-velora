type OptionalGoogleFormField =
  | 'requestReference'
  | 'serviceIds'
  | 'vehicleCategory'
  | 'vehicleMultiplier'
  | 'estimatedPrice'
  | 'estimatedDuration'
  | 'pricingVersion'
  | 'consentTimestamp'
  | 'consentPolicyVersion'

export type SubmissionMode = 'demo' | 'googleForms'

export type PublicSiteConfig = {
  businessName: string
  publicUrl: string
  submissionMode: SubmissionMode
  bookingEmail: string | null
  phoneDisplay: string | null
  phoneHref: string | null
  address: string | null
  instagramUrl: string | null
  privacyContact: string | null
  dataControllerName: string | null
  dataRetentionPeriod: string | null
  consentPolicyVersion: string
  pricingVersion: string
  requiredConfigurationLabels: {
    email: string
    phone: string
    address: string
    instagram: string
    privacyContact: string
    dataController: string
    retentionPeriod: string
  }
  googleForms: {
    action: string
    fields: {
      name: string
      phone: string
      email: string
      vehicle: string
      services: string
      message: string
      consent: string
      language: string
      dateYear: string
      dateMonth: string
      dateDay: string
    }
    optionalFields: Record<OptionalGoogleFormField, string | null>
  }
}

export const siteConfig: PublicSiteConfig = {
  businessName: 'VELORA Detail Lab',
  publicUrl: 'https://auto-velora.netlify.app/',
  submissionMode: 'demo',
  bookingEmail: null,
  phoneDisplay: null,
  phoneHref: null,
  address: null,
  instagramUrl: null,
  privacyContact: null,
  dataControllerName: null,
  dataRetentionPeriod: null,
  consentPolicyVersion: '2026-07-phase1',
  pricingVersion: '2026-07-phase1',
  requiredConfigurationLabels: {
    email: '[REQUIRED CONFIGURATION: booking email]',
    phone: '[REQUIRED CONFIGURATION: phone number]',
    address: '[REQUIRED CONFIGURATION: Riga studio address]',
    instagram: '[REQUIRED CONFIGURATION: Instagram URL]',
    privacyContact: '[REQUIRED CONFIGURATION: privacy contact]',
    dataController: '[REQUIRED CONFIGURATION: data controller name]',
    retentionPeriod: '[REQUIRED CONFIGURATION: retention period]',
  },
  googleForms: {
    action: 'https://docs.google.com/forms/d/e/1FAIpQLSe8xXKqynodEIupnPoUCX58gvPGDEqg_x5UJwOHe7PxqKLYgw/formResponse',
    fields: {
      name: 'entry.1344056069',
      phone: 'entry.1110278868',
      email: 'entry.1872687036',
      vehicle: 'entry.1645789321',
      services: 'entry.930665753',
      message: 'entry.1446527028',
      consent: 'entry.849460245',
      language: 'entry.1871472524',
      dateYear: 'entry.849225596_year',
      dateMonth: 'entry.849225596_month',
      dateDay: 'entry.849225596_day',
    },
    optionalFields: {
      requestReference: null,
      serviceIds: null,
      vehicleCategory: null,
      vehicleMultiplier: null,
      estimatedPrice: null,
      estimatedDuration: null,
      pricingVersion: null,
      consentTimestamp: null,
      consentPolicyVersion: null,
    },
  },
}
