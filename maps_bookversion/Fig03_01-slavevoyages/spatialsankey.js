// spatialsankey.js : based on 
// modifications: removed nodes, allow adjustment of widths for dynamic flow allocation


(function() {

d3.spatialsankey = function() {
  // Define control variables
  var spatialsankey = {},
      map,
      nodes = {},
      links = [],
      flowfield = "",
      flows = [],
      node_flow_range = {},
      link_flow_range = {},
      remove_zero_links = true,
      remove_zero_nodes = true,
      version = '0.0.5';

  // Get or set leaflet map instance
  spatialsankey.lmap = function(_) {
    if(!arguments.length) return map;
    map = _;
    return spatialsankey;
  };

  // Get or set data for nodes
  spatialsankey.nodes = function(_) {
    if (!arguments.length) return nodes;
    nodes = _;
    // Reduce data to feature list
    if(nodes.features) nodes = nodes.features;
    // GeoJson uses lon/lat, leaflet uses lat/lon, so coordinates need to be reversed
    nodes.forEach(function(d){d.geometry.coordinates.reverse();})
    return spatialsankey;
  };

  // Get or set data for flow volumes (optional)
  spatialsankey.flows = function(_) {
    if (!arguments.length) return flows;
    flows = _;    
    return spatialsankey;
  };

  spatialsankey.datafields=function() {
      var fields=[];
      Object.keys(links[0]).forEach(function(f) {
	      if (!(f.startsWith("source") ||
		    f.startsWith("target") ||
		    f.startsWith("way") ||
		    f.startsWith("display"))) {
		  fields.push(f);
	      }
	  });
      return fields;
  }
      
  // Calculates ranges for flows and nodes used for node radii and flow width drawing
  spatialsankey.ranges = function() {
      
    var datafields=spatialsankey.datafields();
    
    // Calculate global ranges of values for links
    link_flow_range.min = d3.min(links, function(link) { return d3.min(datafields, function (d) { return parseFloat(link[d]); }) });;
    link_flow_range.max = d3.max(links, function(link) { return d3.max(datafields, function (d) { return parseFloat(link[d]); }) });;

    return {links: link_flow_range};
  };

  // Get or set data for links
  spatialsankey.links = function(_) {
    if (!arguments.length) return links;
    links = _;
    // Match nodes to links
    links = links.map(function(link){

      // Get target and source features
      var source_feature = nodes.filter(function(node) { return node.id == link.source; })[0],
          target_feature = nodes.filter(function(node) { return node.id == link.target; })[0],
          waypoint_feature = nodes.filter(function(node) { return node.id == link.waypoint; })[0];

      // If nodes were not found, return null
      if (!(source_feature && target_feature)) return null;
      
      // Set coordinates for source and target      
      link.source_coords = source_feature.geometry.coordinates;
      link.target_coords = target_feature.geometry.coordinates;
      link.waypoint_coords = waypoint_feature.geometry.coordinates;
    
      return link;
    });

    // Ignore links that have no node match
    var link_count = links.length;
    links = links.filter(function(link){ return link != null});
    if(link_count != links.length){
      console.log('Dropped ' + (link_count - links.length) + ' links that could not be matched to a node.');
    }
    
    // Calculate ranges for dynamic drawing
    spatialsankey.ranges();

    return spatialsankey;
  };

  // Draw link element
  spatialsankey.link = function(options) {
    
    // Link styles
    // x and y shifts for control points
    var sx = 0.4,
        sy = 0.1;
    // With range of lines, set min and max to be equal for a constant width.
    var width_range = {min: 1, max: 8};
    // If true, links are only shown if there is a flow value for them
    var hide_zero_flows = true;
    // Use arcs instead of S shaped bezier curves
    var arcs = false;
    // If true, lines are flipped along x axis
    var flip = false;
    //
    var flowfield = 'flow';

    // Customize link styles using options
    if(options){
      if(options.xshift) sx = options.xshift;
      if(options.yshift) sy = options.yshift;
      if(options.minwidth) width_range.min = options.minwidth;
      if(options.maxwidth) width_range.max = options.maxwidth;
      if(options.use_arcs) arcs = options.use_arcs;
      if(options.flip) flip = options.flip;
      if(options.flowfield) flowfield = options.flowfield;
    }

    // Define path drawing function
    var link = function(d) {
      // Set control point inputs
      var source = map.latLngToLayerPoint(d.source_coords),
          target = map.latLngToLayerPoint(d.target_coords),
          waypoint = map.latLngToLayerPoint(d.waypoint_coords),
          dx = source.x - target.x,
          dy = source.y - target.y;


      var lineGenerator=d3.line().curve(d3.curveCatmullRom);

      var pathData=lineGenerator([[source.x,source.y],[waypoint.x,waypoint.y],[target.x,target.y]]);
      return pathData;

    };

    // Calculate width based on data range and width range setting
    var width = function(d) {
          // Don't draw flows with zero flow unless zero is the minimum
          if(d[flowfield] == 0 ) return 0;
          // Calculate width value based on flow range
          var diff = d[flowfield] - link_flow_range.min,
              range = link_flow_range.max - link_flow_range.min;
          return (width_range.max - width_range.min)*(diff/range) + width_range.min;
        };
    
    // Get or set link width function
    link.width = function(_) {
      if (!arguments.length) return width;
      width = _;
      return width;
    };

    return link;
  };

  // Draw node circle
  spatialsankey.node = function(options){
    // Node styles
    // Range of node circles (set min and max equal for constant circle size)
    var node_radius_range = {min: 10, max: 20};
    // Range for color coding according to flow size (set colors for single coloring)
    node_color_range = ["yellow", "red"];
    // Customize link styles using options
    if(options){
      if(options.minradius) node_radius_range.min = options.minradius;
      if(options.maxradius) node_radius_range.max = options.maxradius;
      if(options.mincolor) node_color_range[0] = options.mincolor;
      if(options.maxcolor) node_color_range[1] = options.maxcolor;
    }

    // Instantiate color scale function after checking options
    var color = d3.scale.linear()
                  .domain([0, 1])
                  .range(node_color_range);

    // Node object
    var node = {};

    // Node object properties
    node.cx = function(d) {
      cx = map.latLngToLayerPoint(d.geometry.coordinates).x;
      if(!cx) return null;
      return cx;
    };
    node.cy = function(d) {
      cy = map.latLngToLayerPoint(d.geometry.coordinates).y;
      if(!cy) return null;
      return cy;
    };
    node.r = function(d) {
      if (d.properties.aggregate_outflows == 0) return 0;
      var diff = d.properties.aggregate_outflows - node_flow_range.min,
      range = Math.max(node_flow_range.max - node_flow_range.min,0.0001);
      return (node_radius_range.max - node_radius_range.min)*(diff/range) + node_radius_range.min;
    };
    node.color = function(_) {
      if (!arguments.length) return color;
      color = _;
      return node;
    };
    node.fill = function(d) {
      var diff = d.properties.aggregate_outflows - node_flow_range.min,
          range = node_flow_range.max - node_flow_range.min,
          load = diff/range;
      return color(load);
    };
    return node;
  };

  return spatialsankey;
};

})();
