function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
import React from 'react';
const DropdownIcon = props => {
  return /*#__PURE__*/React.createElement("svg", _extends({
    xmlns: "http://www.w3.org/2000/svg",
    width: "8",
    height: "5",
    viewBox: "0 0 8 5",
    fill: "currentcolor"
  }, props), /*#__PURE__*/React.createElement("polygon", {
    fillRule: "evenodd",
    points: "0 0 8 0 4 5"
  }));
};
export default DropdownIcon;