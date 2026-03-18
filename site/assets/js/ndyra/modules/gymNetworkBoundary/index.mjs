const STATUS = {
  key: 'gym_network_boundary',
  owner: 'NDYRA Core host shell + GYM01 separate workflow',
  status: 'host_surface_contract_stub',
  surfaces: [
    { label:'Member gyms', path:'/app/gyms/' },
    { label:'Public gym profile', path:'/gym/profile/' },
    { label:'Gym join handoff', path:'/gym/join/' },
  ],
  notice: 'GYM01 owns content and discovery behavior later. Core only declares the lane and keeps BizGym business/runtime ownership separate.'
};

export function getGymNetworkBoundaryStatus(){
  return structuredClone ? structuredClone(STATUS) : JSON.parse(JSON.stringify(STATUS));
}

export function listGymNetworkSurfaceTargets(){
  return STATUS.surfaces.map((item)=> ({ ...item }));
}

export function getGymNetworkBridgeNotice(){
  return STATUS.notice;
}
