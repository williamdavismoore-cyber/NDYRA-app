import { safeText } from '../../lib/utils.mjs';

const CONNECTORS = [
  { key:'apple_healthkit', label:'Apple Health', status:'native_wrapper_required', note:'Requires a native-capable wrapper or companion app before web sync can begin.' },
  { key:'garmin_connect', label:'Garmin', status:'official_api_program', note:'Can move through an approved Garmin developer integration with server-side sync.' },
  { key:'whoop', label:'Whoop', status:'planned_future_connector', note:'Planned future connector once BIO01 reaches connector expansion.' },
  { key:'oura', label:'Oura', status:'planned_future_connector', note:'Planned future connector once BIO01 reaches connector expansion.' },
  { key:'polar', label:'Polar', status:'planned_future_connector', note:'Planned future connector once BIO01 reaches connector expansion.' },
];

const METRICS = [
  'Heart rate',
  'Workout duration',
  'Calories burned',
  'Distance and pace',
  'VO2 and training load when available',
  'Sleep data',
  'Recovery metrics',
];

const SURFACES = [
  { key:'profile_settings', label:'Device connection settings', path:'/app/settings/#health-data' },
  { key:'fitness_bio', label:'Fitness bio in profile', path:'/app/profile/' },
  { key:'performance_dashboard', label:'Performance dashboard', path:'/app/performance/' },
  { key:'aftermath_bio_summary', label:'Aftermath biometric summary', path:'/app/aftermath/' },
  { key:'story_generation', label:'Story generation inputs', path:'/app/stories/' },
];

const PRIVACY_DEFAULTS = {
  default_visibility: 'private',
  per_metric_controls: true,
  auto_public_share: false,
  notes: 'Biometrics stay private by default until the member explicitly connects a device and chooses what can be shared.',
};

export function listConnectorTargets(){
  return CONNECTORS.map((item)=> ({ ...item }));
}

export function listSupportedBiometricMetrics(){
  return [...METRICS];
}

export function listDerivedSurfaceTargets(){
  return SURFACES.map((item)=> ({ ...item }));
}

export function getBiometricsPrivacyDefaults(){
  return { ...PRIVACY_DEFAULTS };
}

export function getBiometricsBoundaryStatus(){
  return {
    status: 'host_ready_waiting_module',
    owner: 'BIO01 separate workflow + PROF01 mounts',
    connectors: listConnectorTargets(),
    metrics: listSupportedBiometricMetrics(),
    surfaces: listDerivedSurfaceTargets(),
    privacy_defaults: getBiometricsPrivacyDefaults(),
    note: 'Core is ready to host biometric settings, fitness bio mounts, and dashboard shells, but BIO01 ingestion is not integrated yet.',
  };
}

export function getBiometricsBridgeNotice(){
  return safeText(getBiometricsBoundaryStatus().note);
}

export function getPerformancePreviewModel(){
  const status = getBiometricsBoundaryStatus();
  return {
    header: 'Performance is getting a dedicated biometrics spine.',
    status: status.status,
    owner: status.owner,
    connectors: status.connectors,
    metrics: status.metrics,
    surfaces: status.surfaces,
    privacy_defaults: status.privacy_defaults,
  };
}
