const STATUS = {
  key: 'challenges_events_boundary',
  owner: 'NDYRA Core host shell + CE01 separate workflow',
  status: 'host_surface_contract_stub',
  surfaces: [
    { label:'Challenges', path:'/app/challenges/' },
    { label:'Events', path:'/app/events/' },
  ],
  notice: 'CE01 owns challenge and event content later. Core keeps Stories as content, Signals as alerts, and Aftermath as the recap hub.'
};

export function getChallengesEventsBoundaryStatus(){
  return structuredClone ? structuredClone(STATUS) : JSON.parse(JSON.stringify(STATUS));
}

export function listChallengeEventSurfaceTargets(){
  return STATUS.surfaces.map((item)=> ({ ...item }));
}

export function getChallengesEventsBridgeNotice(){
  return STATUS.notice;
}
