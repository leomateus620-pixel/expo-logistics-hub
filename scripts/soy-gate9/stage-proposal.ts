import { writeFileSync } from 'node:fs';
import { lactalisAudienceOrientationProposal } from '../../src/features/commercial-map/utils/lactalisOrientationProposal';
const proposal=lactalisAudienceOrientationProposal();
writeFileSync('docs/screenshots/map-startup/stage-orientation-applied.json',JSON.stringify(proposal,null,2));
console.log(JSON.stringify({degrees:proposal.degrees,collisions:proposal.collisions,scale:proposal.planScale,reduction:proposal.reductionPercent}));
