import React, { Component } from 'react';
import PropTypes from 'prop-types';

import { omit } from '../../utils';
import {
  buildSmoothPath,
  buildLinearPath,
  injectStyleTag,
} from '../../helpers/DOM.helpers';
import { normalize } from '../../helpers/math.helpers';
import { generateId } from '../../helpers/misc.helpers';
import { normalizeDataset, generateAutoDrawCss } from './Trend.helpers';

const propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.number,
      PropTypes.shape({
        value: PropTypes.number,
      }),
    ]).isRequired
  ).isRequired,
  smooth: PropTypes.bool,
  autoDraw: PropTypes.bool,
  autoDrawDuration: PropTypes.number,
  autoDrawEasing: PropTypes.string,
  width: PropTypes.number,
  height: PropTypes.number,
  padding: PropTypes.number,
  radius: PropTypes.number,
  gradient: PropTypes.arrayOf(PropTypes.string),
  rangeHighlight: PropTypes.arrayOf(PropTypes.number, PropTypes.number),
  rangeHighlightColor: PropTypes.string,
  hoverLineColor: PropTypes.string,
  hoverLineWidth: PropTypes.number,
  hoverTextColor: PropTypes.string,
  hoverTextSize: PropTypes.number,
  hoverTextWeight: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};

const defaultProps = {
  radius: 10,
  stroke: 'black',
  padding: 8,
  strokeWidth: 1,
  autoDraw: false,
  autoDrawDuration: 2000,
  autoDrawEasing: 'ease',
  rangeHighlight: [],
  rangeHighlightColor: 'transparent',
  hoverTextColor: '#aaa',
  hoverTextSize: 14,
  hoverTextWeight: 'bold',
  hoverLineColor: 'red',
  hoverLineWidth: 2,
};

class Trend extends Component {
  constructor(props) {
    super(props);

    // Generate a random ID. This is important for distinguishing between
    // Trend components on a page, so that they can have different keyframe
    // animations.
    this.trendId = generateId();
    this.gradientId = `react-trend-vertical-gradient-${this.trendId}`;
    this.hoverTextNode = null;
    this.svgNode = null;
    this.hoverTimeout = null;
    this.hoverLineNode = null;
  }

  componentDidMount() {
    const { autoDraw, autoDrawDuration, autoDrawEasing } = this.props;

    if (autoDraw) {
      this.lineLength = this.path.getTotalLength();

      const css = generateAutoDrawCss({
        id: this.trendId,
        lineLength: this.lineLength,
        duration: autoDrawDuration,
        easing: autoDrawEasing,
      });

      injectStyleTag(css);
    }
  }

  componentWillUnmount() {
    clearTimeout(this.hoverTimeout);
  }

  getDelegatedProps() {
    return omit(this.props, Object.keys(propTypes));
  }

  handleMouseMove(e, values) {
    const { offsetX: x } = e.nativeEvent;
    const { svgNode, path, hoverTextNode, hoverLineNode } = this;
    const svgRect = svgNode.getBoundingClientRect();
    const pathRect = path.getBoundingClientRect();

    if (x >= pathRect.left - svgRect.left && x <= pathRect.left - svgRect.left + pathRect.width) {
      const computedX = x - (pathRect.left - svgRect.left);
      const value = values[Math.round(computedX / pathRect.width * (values.length - 1))];

      hoverTextNode.innerHTML = value;

      hoverLineNode.setAttribute('opacity', 1);
      hoverLineNode.setAttribute('x1', `${x / svgRect.width * 100}%`);
      hoverLineNode.setAttribute('x2', `${x / svgRect.width * 100}%`);

      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = setTimeout(() => {
        hoverLineNode.setAttribute('opacity', 0);
        hoverTextNode.innerHTML = '';
      }, 1000);
    } else {
      hoverLineNode.setAttribute('opacity', 0);
      hoverTextNode.innerHTML = '';
    }
  }

  renderGradientDefinition() {
    const { gradient } = this.props;

    return (
      <defs>
        <linearGradient
          id={this.gradientId}
          x1="0%"
          y1="0%"
          x2="0%"
          y2="100%"
        >
          {gradient.slice().reverse().map((c, index) => (
            <stop
              key={index}
              offset={normalize({
                value: index,
                min: 0,
                // If we only supply a single colour, it will try to normalize
                // between 0 and 0, which will create NaN. By making the `max`
                // at least 1, we ensure single-color "gradients" work.
                max: gradient.length - 1 || 1,
              })}
              stopColor={c}
            />
          ))}
        </linearGradient>
      </defs>
    );
  }

  render() {
    const {
      data,
      smooth,
      width,
      height,
      padding,
      radius,
      gradient,
      rangeHighlight,
      rangeHighlightColor,
      hoverTextSize,
      hoverTextColor,
      hoverTextWeight,
      hoverLineColor,
      hoverLineWidth,
    } = this.props;

    // We need at least 2 points to draw a graph.
    if (!data || data.length < 2) {
      return null;
    }

    // `data` can either be an array of numbers:
    // [1, 2, 3]
    // or, an array of objects containing a value:
    // [ { value: 1 }, { value: 2 }, { value: 3 }]
    //
    // For now, we're just going to convert the second form to the first.
    // Later on, if/when we support tooltips, we may adjust.
    const plainValues = data.map(point => (
      typeof point === 'number' ? point : point.value
    ));

    // Our viewbox needs to be in absolute units, so we'll default to 300x75
    // Our SVG can be a %, though; this is what makes it scalable.
    // By defaulting to percentages, the SVG will grow to fill its parent
    // container, preserving a 1/4 aspect ratio.
    const viewBoxWidth = width || 300;
    const viewBoxHeight = height || 75;
    const svgWidth = width || '100%';
    const svgHeight = height || '25%';

    const normalizedValues = normalizeDataset(plainValues, {
      minX: padding,
      maxX: viewBoxWidth - padding,
      // NOTE: Because SVGs are indexed from the top left, but most data is
      // indexed from the bottom left, we're inverting the Y min/max.
      minY: viewBoxHeight - padding,
      maxY: padding,
    });

    const path = smooth
      ? buildSmoothPath(normalizedValues, { radius })
      : buildLinearPath(normalizedValues);

    let rangeHighlightStart;
    let rangeHighlightEnd;

    if (rangeHighlight.length === 2) {
      const [first, second] = rangeHighlight;

      rangeHighlightStart = normalizedValues[first].x;
      rangeHighlightEnd = normalizedValues[second].x;

      const gap = normalizedValues[1].x - normalizedValues[0].x;

      rangeHighlightStart -= gap / 2;
      rangeHighlightEnd += gap / 2;
    }

    return (
      <svg
        onMouseMove={(e) => { this.handleMouseMove(e, plainValues); }}
        width={svgWidth}
        height={svgHeight}
        ref={(ref) => { this.svgNode = ref; }}
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        {...this.getDelegatedProps()}
      >
        {gradient && this.renderGradientDefinition()}
        {rangeHighlightStart && rangeHighlightEnd &&
        <rect
          x={rangeHighlightStart} y={0}
          stroke="transparent"
          strokeWidth={0}
          fill={rangeHighlightColor}
          width={rangeHighlightEnd - rangeHighlightStart} height={viewBoxHeight}
        />}
        <path
          ref={(elem) => { this.path = elem; }}
          id={`react-trend-${this.trendId}`}
          d={path}
          fill="none"
          stroke={gradient ? `url(#${this.gradientId})` : undefined}
        />
        <text
          fill={hoverTextColor}
          fontSize={hoverTextSize}
          fontWeight={hoverTextWeight}
          stroke="none"
          alignmentBaseline="hanging"
          textAnchor="top"
          ref={(ref) => { this.hoverTextNode = ref; }}
        />
        <line
          opacity={0}
          ref={(ref) => { this.hoverLineNode = ref; }}
          x1="0"
          y1="0"
          x2="0"
          y2="100%"
          stroke={hoverLineColor}
          strokeWidth={hoverLineWidth}
        />
      </svg>
    );
  }
}

Trend.propTypes = propTypes;
Trend.defaultProps = defaultProps;

export default Trend;
