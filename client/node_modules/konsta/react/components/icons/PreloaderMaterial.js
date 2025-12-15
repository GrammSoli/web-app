function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
import React from 'react';
const PreloaderMaterial = props => {
  return /*#__PURE__*/React.createElement("svg", _extends({
    viewBox: "0 0 36 36"
  }, props, {
    fill: "none",
    stroke: "currentcolor"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "18",
    cy: "18",
    r: "16"
  }));
};
export default PreloaderMaterial;