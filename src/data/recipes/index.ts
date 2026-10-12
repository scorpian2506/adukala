import type { Recipe } from "../../lib/types";
import { dalTadka } from "./dal-tadka";
import { jeeraRice } from "./jeera-rice";
import { rajmaMasala } from "./rajma-masala";
import { alooGobi } from "./aloo-gobi";
import { paneerButterMasala } from "./paneer-butter-masala";
import { choleMasala } from "./chole-masala";
import { masalaChai } from "./masala-chai";
import { sambar } from "./sambar";
import { tomatoRasam } from "./tomato-rasam";
import { lemonRice } from "./lemon-rice";
import { ravaUpma } from "./rava-upma";
import { coconutChutney } from "./coconut-chutney";
import { venPongal } from "./ven-pongal";
import { curdRice } from "./curd-rice";

export const SEED_RECIPES: Recipe[] = [
  // North
  dalTadka,
  jeeraRice,
  rajmaMasala,
  alooGobi,
  paneerButterMasala,
  choleMasala,
  masalaChai,
  // South
  sambar,
  tomatoRasam,
  lemonRice,
  ravaUpma,
  coconutChutney,
  venPongal,
  curdRice,
];
