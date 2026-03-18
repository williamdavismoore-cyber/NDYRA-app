const STATUS = {
  key: 'checkin_spine_boundary',
  owner: 'NDYRA Core host shell + future CHKIN01 shared spine',
  status: 'paused_boundary_shell_ready',
  surfaces: [
    { label:'Member Check-In boundary', path:'/app/check-in/' },
    { label:'Business Check-In boundary', path:'/biz/check-in/' },
    { label:'Kiosk boundary', path:'/biz/check-in/kiosk/' },
    { label:'Live boundary', path:'/biz/check-in/live/' },
  ],
  resume_rules: [
    'Do not claim runtime ownership while the lane is paused.',
    'Member UI resumes in Core only after explicit Architect approval.',
    'Business ops UI remains in BizGym even after the lane is resumed.'
  ],
  notice: 'Check-In remains paused. Core now keeps both the member and business boundary shells visible as architecture seams only.'
};

function clone(value){
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function getCheckinSpineBoundaryStatus(){
  return clone(STATUS);
}

export function listCheckinBoundarySurfaces(){
  return clone(STATUS.surfaces);
}

export function getCheckinResumeRules(){
  return [...STATUS.resume_rules];
}

export function getCheckinBoundaryNotice(){
  return STATUS.notice;
}
