import { contrastRatio, deltaEOklab, oklchToCss } from '../src/lib/color/oklch';
import { SEED_PALETTE, FORBIDDEN_ANCHORS, getCandidateSpace, isValidCandidate } from '../src/lib/color/identity-allocator';

console.log('Seed contrast vs light/dark:');
SEED_PALETTE.forEach((s,i)=>{
  console.log(i, oklchToCss(s), 'light', contrastRatio(s,'#f8fafc').toFixed(2), 'dark', contrastRatio(s,'#0b1220').toFixed(2));
});

console.log('\nMin ΔE seed→anchors:');
SEED_PALETTE.forEach((s,i)=>{
  let min=Infinity, who=-1;
  FORBIDDEN_ANCHORS.forEach((a,j)=>{const d=deltaEOklab(s,a); if(d<min){min=d;who=j;}});
  console.log(i, 'min', min.toFixed(2), 'anchor#', who);
});

console.log('\nCandidate space size:', getCandidateSpace().length);

const ls=[0.55,0.6,0.65,0.7,0.75];
const cs=[0.1,0.13,0.16,0.18];
ls.forEach(L=>cs.forEach(C=>{
  let count=0;
  for(let h=0;h<360;h+=10){if(isValidCandidate({L,C,h}))count++;}
  console.log('L',L,'C',C,'valid hues:',count);
}));
