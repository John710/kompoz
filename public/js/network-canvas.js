const NetworkCanvas = (() => {
  const svg = d3.select('#networkSvg');
  const defs = svg.append('defs');
  defs.append('pattern')
    .attr('id', 'gridPattern')
    .attr('width', 40)
    .attr('height', 40)
    .attr('patternUnits', 'userSpaceOnUse')
    .append('path')
    .attr('d', 'M 40 0 L 0 0 0 40')
    .attr('fill', 'none')
    .attr('stroke', 'var(--border)')
    .attr('stroke-width', 0.5)
    .attr('stroke-opacity', 0.6);

  const container = svg.append('g').attr('class', 'container');
  const gridGroup = container.append('g').attr('class', 'grid');
  const edgesGroup = container.append('g').attr('class', 'edges');
  const nodesGroup = container.append('g').attr('class', 'nodes');

  let width = 0, height = 0;
  let zoomTransform = d3.zoomIdentity;
  let zoomBehavior;
  let tool = 'pan';
  let nodes = [], edges = [];
  let selectedNodeId = null;
  let selectedLinkId = null;
  let callbacks = {};
  let gridVisible = true;
  let showLinkLabels = true;
  let lastVisibleIds = null;
  const NODE_W = 160, NODE_H = 64;

  const tempLineGroup = container.append('g').attr('class', 'temp-line').style('display', 'none').style('pointer-events', 'none');
  let linkDragState = null;

  const EDGE_STYLES = {
    ethernet:   { dash: '0',         color: 'var(--text3)',  width: 1.5, animate: false, wavy: false },
    wifi:       { dash: '6,3',       color: 'var(--accent)', width: 1.5, animate: true,  wavy: false },
    vpn:        { dash: '8,4',       color: 'var(--purple)', width: 2,   animate: false, wavy: false },
    docker:     { dash: '0',         color: 'var(--green)',  width: 1.5, animate: false, wavy: false },
    lxc:        { dash: '0',         color: 'var(--yellow)', width: 1.5, animate: false, wavy: false },
    bluetooth:  { dash: '4,2',       color: '#0a84ff',      width: 1.5, animate: true,  wavy: false },
    zigbee:     { dash: '5,3',       color: '#ff9500',      width: 1.5, animate: true,  wavy: false },
    matter:     { dash: '3,3',       color: '#00c7be',      width: 1.5, animate: false, wavy: false },
    zwave:      { dash: '7,3',       color: '#5856d6',      width: 1.5, animate: false, wavy: false },
    thread:     { dash: '4,4',       color: '#34c759',      width: 2,   animate: true,  wavy: false },
    lowvoltage: { dash: '0',         color: 'var(--red)',   width: 1.5, animate: false, wavy: false },
  };

  const ANCHORS = {
    top: { x: NODE_W / 2, y: 0 },
    right: { x: NODE_W, y: NODE_H / 2 },
    bottom: { x: NODE_W / 2, y: NODE_H },
    left: { x: 0, y: NODE_H / 2 }
  };

  // Waypoint drag behavior
  const waypointDrag = d3.drag()
    .on('start', function(e, d) {
      e.sourceEvent.stopPropagation();
      d3.select(this).raise();
    })
    .on('drag', function(e, { link, idx }) {
      const [x, y] = d3.pointer(e, container.node());
      const waypoints = link.waypoints || [];
      waypoints[idx] = { x, y };
      link.waypoints = waypoints;
      renderEdges(lastVisibleIds);
    })
    .on('end', function(e, { link }) {
      if (callbacks.onLinkUpdate) callbacks.onLinkUpdate(link);
    });

  // Anchor drag behavior
  const anchorDrag = d3.drag()
    .on('start', function(e, { node, pos }) {
      e.sourceEvent.stopPropagation();
      linkDragState = { sourceId: node.id, sourcePos: pos };
      document.body.classList.add('link-dragging');
      const nx = node.x || 0;
      const ny = node.y || 0;
      const anchor = ANCHORS[pos];
      setTempLine(node.id, nx + anchor.x, ny + anchor.y, pos);
      // Re-render nodes to show anchors on all nodes
      renderNodes(lastVisibleIds);
    })
    .on('drag', function(e) {
      const [x, y] = d3.pointer(e, container.node());
      if (linkDragState) {
        setTempLine(linkDragState.sourceId, x, y, linkDragState.sourcePos);
      }
    })
    .on('end', function(e) {
      document.body.classList.remove('link-dragging');
      if (!linkDragState) return;
      
      const [x, y] = d3.pointer(e, container.node());
      
      // Find the target node and its anchor
      let targetNode = null;
      let targetPos = null;
      
      for (const n of nodes) {
        if (String(n.id) === String(linkDragState.sourceId)) continue;
        
        const nx = n.x || 0;
        const ny = n.y || 0;
        
        // Check each anchor position
        for (const [pos, anchor] of Object.entries(ANCHORS)) {
          const ax = nx + anchor.x;
          const ay = ny + anchor.y;
          const dist = Math.sqrt((x - ax) ** 2 + (y - ay) ** 2);
          if (dist < 15) { // Threshold distance
            targetNode = n;
            targetPos = pos;
            break;
          }
        }
        
        if (targetNode) break;
      }
      
      if (targetNode && callbacks.onCreateLink) {
        callbacks.onCreateLink(linkDragState.sourceId, targetNode.id, linkDragState.sourcePos, targetPos);
      }
      
      linkDragState = null;
      setTempLine(null, 0, 0);
      // Re-render nodes to hide anchors on all except selected
      renderNodes(lastVisibleIds);
    });

  function init(cb) {
    callbacks = cb || {};
    const wrapper = document.querySelector('.canvas-wrapper');
    width = wrapper.clientWidth;
    height = wrapper.clientHeight;
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    drawGrid();

    zoomBehavior = d3.zoom()
      .scaleExtent([0.2, 4])
      .duration(250) // Smooth zoom transitions
      .on('zoom', (e) => {
        zoomTransform = e.transform;
        container.attr('transform', e.transform);
      });
    svg.call(zoomBehavior).on('dblclick.zoom', null);

    svg.on('click', (e) => {
      // Проверяем, не был ли клик по узлу или якорю (для SVG)
      let target = e.target;
      let isClickOnNode = false;
      // Проверяем родительские элементы
      while (target) {
        if (target.classList && (target.classList.contains('network-node') || target.classList.contains('anchor'))) {
          isClickOnNode = true;
          break;
        }
        target = target.parentNode;
      }
      if (isClickOnNode) {
        return;
      }
      selectNode(null);
      selectedLinkId = null;
      renderEdges(lastVisibleIds);
      hideTooltip();
      linkDragState = null;
      setTempLine(null, 0, 0);
    });

    // Delete key handler for selected links
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedLinkId !== null) {
          // Find the link
          const linkIndex = edges.findIndex(link => String(link.id) === String(selectedLinkId));
          if (linkIndex !== -1) {
            const link = edges[linkIndex];
            if (callbacks.onDeleteLink) {
              callbacks.onDeleteLink(link);
            }
          }
        }
      }
    });

    window.addEventListener('resize', () => {
      width = wrapper.clientWidth;
      height = wrapper.clientHeight;
      svg.attr('viewBox', `0 0 ${width} ${height}`);
    });
  }

  function setTool(t) { tool = t; }
  function toggleGrid() {
    gridVisible = !gridVisible;
    gridGroup.style('display', gridVisible ? 'block' : 'none');
    return gridVisible;
  }
  function toggleLinkLabels() {
    showLinkLabels = !showLinkLabels;
    renderEdges();
    return showLinkLabels;
  }

  function drawGrid() {
    gridGroup.selectAll('*').remove();
    gridGroup.append('rect')
      .attr('x', -100000)
      .attr('y', -100000)
      .attr('width', 200000)
      .attr('height', 200000)
      .attr('fill', 'url(#gridPattern)');
  }

  function render(dataNodes, dataEdges, visibleIds) {
    console.log('NetworkCanvas.render: Called with', dataNodes.length, 'nodes,', dataEdges.length, 'edges, visibleIds:', visibleIds);
    nodes = dataNodes;
    edges = dataEdges;
    lastVisibleIds = visibleIds;
    renderEdges(visibleIds);
    renderNodes(visibleIds);
  }

  function getBestAnchors(x1, y1, x2, y2) {
    const sx = x1 + NODE_W / 2, sy = y1 + NODE_H / 2;
    const tx = x2 + NODE_W / 2, ty = y2 + NODE_H / 2;
    const dx = tx - sx, dy = ty - sy;
    let sPos, tPos;
    if (Math.abs(dx) > Math.abs(dy)) {
      sPos = dx > 0 ? 'right' : 'left';
      tPos = dx > 0 ? 'left' : 'right';
    } else {
      sPos = dy > 0 ? 'bottom' : 'top';
      tPos = dy > 0 ? 'top' : 'bottom';
    }
    return { sPos, tPos };
  }

  function makeWavyPath(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 4) return `M${x1},${y1} L${x2},${y2}`;
    var amp = 4;
    var waveLen = 10;
    var numWaves = Math.max(2, Math.round(len / waveLen));
    var angle = Math.atan2(dy, dx);
    var px = -Math.sin(angle) * amp;
    var py = Math.cos(angle) * amp;
    var sx = dx / numWaves;
    var sy = dy / numWaves;
    var d = `M${x1},${y1}`;
    for (var i = 0; i < numWaves; i++) {
      var qx = x1 + sx * (i + 0.5) + px * (i % 2 === 0 ? 1 : -1);
      var qy = y1 + sy * (i + 0.5) + py * (i % 2 === 0 ? 1 : -1);
      var ex = x1 + sx * (i + 1);
      var ey = y1 + sy * (i + 1);
      d += ` Q${qx.toFixed(1)},${qy.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`;
    }
    return d;
  }

  function makeEdgePath(x1, y1, x2, y2, type, waypoints, sPosOverride, tPosOverride) {
    const style = EDGE_STYLES[type] || EDGE_STYLES.ethernet;
    let sPos, tPos;
    if (sPosOverride && tPosOverride) {
      sPos = sPosOverride;
      tPos = tPosOverride;
    } else {
      const anchors = getBestAnchors(x1, y1, x2, y2);
      sPos = anchors.sPos;
      tPos = anchors.tPos;
    }
    let points = [
      { x: x1 + ANCHORS[sPos].x, y: y1 + ANCHORS[sPos].y },
      ...(waypoints || []),
      { x: x2 + ANCHORS[tPos].x, y: y2 + ANCHORS[tPos].y }
    ];

    if (style.wavy && points.length === 2) {
      return makeWavyPath(points[0].x, points[0].y, points[1].x, points[1].y);
    }

    let d = `M${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L${points[i].x},${points[i].y}`;
    }
    return d;
  }

  // Helper function to get all points for a link
  function getLinkPoints(d) {
    const s = getNode(d.source_id), t = getNode(d.target_id);
    if (!s || !t) return { points: [] };
    let sPos, tPos;
    if (d.sourcePos && d.targetPos) {
      sPos = d.sourcePos;
      tPos = d.targetPos;
    } else {
      const anchors = getBestAnchors(s.x || 0, s.y || 0, t.x || 0, t.y || 0);
      sPos = anchors.sPos;
      tPos = anchors.tPos;
    }
    const points = [
      { x: (s.x || 0) + ANCHORS[sPos].x, y: (s.y || 0) + ANCHORS[sPos].y },
      ...(d.waypoints || []),
      { x: (t.x || 0) + ANCHORS[tPos].x, y: (t.y || 0) + ANCHORS[tPos].y }
    ];
    return { points };
  }

  function renderEdges(visibleIds) {
    const link = edgesGroup.selectAll('.network-edge').data(edges, d => String(d.id));
    link.exit().remove();
    const linkEnter = link.enter().append('g').attr('class', 'network-edge');
    
    // Add transparent hit area for easier clicking
    linkEnter.append('path')
      .attr('class', 'edge-hit')
      .style('cursor', 'pointer')
      .attr('fill', 'none')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 20);
    
    // Add edge line (path)
    linkEnter.append('path')
      .attr('class', 'edge-line')
      .style('pointer-events', 'none');

    // Add waypoints group
    linkEnter.append('g').attr('class', 'waypoints');
    
    // Add add-waypoint buttons group
    linkEnter.append('g').attr('class', 'add-waypoint-buttons');

    // Add label
    const labelEnter = linkEnter.append('text')
      .attr('class', 'edge-label')
      .attr('text-anchor', 'middle')
      .attr('dy', -4)
      .style('cursor', 'pointer');

    const linkMerge = linkEnter.merge(link);

    // Show/hide edge
    linkMerge.style('display', d => {
      if (!visibleIds) return 'block';
      return (visibleIds.has(String(d.source_id)) && visibleIds.has(String(d.target_id))) ? 'block' : 'none';
    });

    // Update edge paths
    const pathD = d => {
      const s = getNode(d.source_id), t = getNode(d.target_id);
      if (!s || !t) return 'M0,0';
      return makeEdgePath(s.x || 0, s.y || 0, t.x || 0, t.y || 0, d.type, d.waypoints, d.sourcePos, d.targetPos);
    };
    
    linkMerge.select('.edge-hit').attr('d', pathD);
    linkMerge.select('.edge-line')
      .attr('d', pathD)
      .attr('stroke-dasharray', d => EDGE_STYLES[d.type]?.dash || '0')
      .attr('stroke', d => (String(d.id) === String(selectedLinkId)) ? 'var(--accent)' : (EDGE_STYLES[d.type]?.color || 'var(--text3)'))
      .attr('stroke-width', d => (String(d.id) === String(selectedLinkId)) ? (EDGE_STYLES[d.type]?.width || 1.5) * 1.5 : (EDGE_STYLES[d.type]?.width || 1.5))
      .style('animation', d => EDGE_STYLES[d.type]?.animate ? 'flow 1s linear infinite' : null)
      .attr('fill', 'none');
    
    // Handle interactions on hit area
    linkMerge.select('.edge-hit')
      .on('click', function(e, d) {
        e.stopPropagation();
        selectedLinkId = String(d.id);
        renderEdges(lastVisibleIds);
      })
      .on('contextmenu', function(e, d) {
        e.preventDefault();
        e.stopPropagation();
        // Show link context menu
        const menu = document.getElementById('linkContextMenu');
        menu.style.display = 'block';
        menu.style.left = e.pageX + 'px';
        menu.style.top = e.pageY + 'px';
        menu.dataset.linkId = d.id;
      });

    // Render waypoints
    const waypointsGroup = linkMerge.select('.waypoints');
    const waypoints = waypointsGroup.selectAll('.waypoint')
      .data(d => (String(d.id) === String(selectedLinkId) ? (d.waypoints || []).map((wp, idx) => ({ link: d, idx, ...wp })) : []));
    
    waypoints.exit().remove();

    const waypointEnter = waypoints.enter().append('circle')
      .attr('class', 'waypoint')
      .attr('r', 4) // Уменьшили размер с 6 до 4
      .attr('fill', 'var(--accent)')
      .attr('stroke', 'var(--bg3)')
      .attr('stroke-width', 2)
      .style('cursor', 'move')
      .on('contextmenu', function(e, { link, idx }) {
        e.preventDefault();
        // Remove waypoint on right click
        const wps = link.waypoints || [];
        wps.splice(idx, 1);
        link.waypoints = wps;
        renderEdges(lastVisibleIds);
        if (callbacks.onLinkUpdate) callbacks.onLinkUpdate(link);
      })
      .call(waypointDrag);

    waypointEnter.merge(waypoints)
      .attr('cx', d => d.x)
      .attr('cy', d => d.y);
      
    // Render add-waypoint buttons only for selected link
    const addButtonsGroup = linkMerge.select('.add-waypoint-buttons');
    const addButtons = addButtonsGroup.selectAll('.add-waypoint-btn')
      .data(d => {
        if (String(d.id) !== String(selectedLinkId)) return [];
        const { points } = getLinkPoints(d);
        if (points.length < 2) return [];
        // Create midpoints between consecutive points
        const midpoints = [];
        for (let i = 0; i < points.length - 1; i++) {
          const x = (points[i].x + points[i+1].x) / 2;
          const y = (points[i].y + points[i+1].y) / 2;
          midpoints.push({ link: d, idx: i, x, y });
        }
        return midpoints;
      });
    
    addButtons.exit().remove();
    
    const addButtonsEnter = addButtons.enter().append('g')
      .attr('class', 'add-waypoint-btn')
      .style('cursor', 'pointer');
      
    // Add circle background
    addButtonsEnter.append('circle')
      .attr('r', 10)
      .attr('fill', 'var(--bg2)')
      .attr('stroke', 'var(--accent)')
      .attr('stroke-width', 1.5);
      
    // Add plus sign
    addButtonsEnter.append('path')
      .attr('d', 'M-4,0 L4,0 M0,-4 L0,4')
      .attr('stroke', 'var(--accent)')
      .attr('stroke-width', 2)
      .attr('stroke-linecap', 'round');
      
    // Add tooltip
    addButtonsEnter.append('title')
      .text('Добавить точку изгиба');
      
    // Handle click on add button
    addButtonsEnter.on('click', function(e, { link, idx }) {
      e.stopPropagation();
      const { points } = getLinkPoints(link);
      const newWaypoint = { x: (points[idx].x + points[idx+1].x) / 2, y: (points[idx].y + points[idx+1].y) / 2 };
      const waypoints = link.waypoints || [];
      waypoints.splice(idx, 0, newWaypoint); // Insert at correct position
      link.waypoints = waypoints;
      renderEdges(lastVisibleIds);
      if (callbacks.onLinkUpdate) callbacks.onLinkUpdate(link);
    });
    
    addButtonsEnter.merge(addButtons)
      .attr('transform', d => `translate(${d.x},${d.y})`);

    // Update label
    linkMerge.select('.edge-label')
      .style('display', d => showLinkLabels && (d.label || d.type) ? 'block' : 'none')
      .attr('x', d => {
        const { points } = getLinkPoints(d);
        if (points.length < 2) return 0;
        // Find the middle segment
        let totalLength = 0;
        const segments = [];
        for (let i = 1; i < points.length; i++) {
          const dx = points[i].x - points[i-1].x;
          const dy = points[i].y - points[i-1].y;
          const length = Math.sqrt(dx * dx + dy * dy);
          segments.push({ start: points[i-1], end: points[i], length });
          totalLength += length;
        }
        // Find middle point along total length
        let targetLength = totalLength / 2;
        let currentLength = 0;
        for (const seg of segments) {
          if (currentLength + seg.length >= targetLength) {
            const t = (targetLength - currentLength) / seg.length;
            return seg.start.x + (seg.end.x - seg.start.x) * t;
          }
          currentLength += seg.length;
        }
        // Fallback to midpoint of first and last
        return (points[0].x + points[points.length-1].x) / 2;
      })
      .attr('y', d => {
        const { points } = getLinkPoints(d);
        if (points.length < 2) return 0;
        // Find the middle segment
        let totalLength = 0;
        const segments = [];
        for (let i = 1; i < points.length; i++) {
          const dx = points[i].x - points[i-1].x;
          const dy = points[i].y - points[i-1].y;
          const length = Math.sqrt(dx * dx + dy * dy);
          segments.push({ start: points[i-1], end: points[i], length });
          totalLength += length;
        }
        // Find middle point along total length
        let targetLength = totalLength / 2;
        let currentLength = 0;
        for (const seg of segments) {
          if (currentLength + seg.length >= targetLength) {
            const t = (targetLength - currentLength) / seg.length;
            return seg.start.y + (seg.end.y - seg.start.y) * t;
          }
          currentLength += seg.length;
        }
        // Fallback to midpoint of first and last
        return (points[0].y + points[points.length-1].y) / 2;
      })
      .attr('transform', d => {
        const { points } = getLinkPoints(d);
        if (points.length < 2) return '';
        // Find the middle segment
        let totalLength = 0;
        const segments = [];
        for (let i = 1; i < points.length; i++) {
          const dx = points[i].x - points[i-1].x;
          const dy = points[i].y - points[i-1].y;
          const length = Math.sqrt(dx * dx + dy * dy);
          segments.push({ start: points[i-1], end: points[i], length });
          totalLength += length;
        }
        // Find middle segment
        let targetLength = totalLength / 2;
        let currentLength = 0;
        let midX = 0, midY = 0, angle = 0;
        for (const seg of segments) {
          if (currentLength + seg.length >= targetLength) {
            const t = (targetLength - currentLength) / seg.length;
            midX = seg.start.x + (seg.end.x - seg.start.x) * t;
            midY = seg.start.y + (seg.end.y - seg.start.y) * t;
            angle = Math.atan2(seg.end.y - seg.start.y, seg.end.x - seg.start.x) * 180 / Math.PI;
            break;
          }
          currentLength += seg.length;
        }
        // Make sure label is right-side up
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;
        return `rotate(${angle}, ${midX}, ${midY})`;
      })
      .text(d => {
        const raw = d.label || d.type || '';
        let label = raw;
        if (typeof I18N !== 'undefined') {
          const predefinedTypes = ['ethernet', 'wifi', 'usb', 'bluetooth', 'zigbee', 'matter', 'zwave', 'thread', 'lowvoltage', 'vpn', 'docker', 'lxc'];
          if (predefinedTypes.includes(raw)) {
            label = I18N.t('linkType_' + raw, { fallback: raw });
          } else {
            label = raw;
          }
        }
        return label.length > 20 ? label.slice(0, 18) + '\u2026' : label;
      });
  }

  // Define drag behavior once, outside renderNodes
  const drag = d3.drag()
    .on('start', function(e, d) {
      e.sourceEvent.stopPropagation();
      d3.select(this).raise();
    })
    .on('drag', function(e, d) {
      d.x = (d.x || 0) + e.dx / zoomTransform.k;
      d.y = (d.y || 0) + e.dy / zoomTransform.k;
      d3.select(this).attr('transform', `translate(${d.x},${d.y})`);
      renderEdges(lastVisibleIds);
    })
    .on('end', function(e, d) {
      if (callbacks.onNodeMove) callbacks.onNodeMove(d);
    });

  function renderNodes(visibleIds) {
    const nodesUpdate = nodesGroup.selectAll('.network-node').data(nodes, d => String(d.id));
    
    // Enter
    const nodesEnter = nodesUpdate.enter().append('g')
      .attr('class', d => 'network-node' + (String(d.id) === String(selectedNodeId) ? ' selected' : ''))
      .attr('transform', d => `translate(${d.x || 0},${d.y || 0})`)
      .style('display', d => (!visibleIds || visibleIds.has(String(d.id)) ? 'block' : 'none'))
      .style('pointer-events', 'all')
      .on('mouseenter', (e, d) => showNodeTooltip(e, d))
      .on('mouseleave', hideTooltip)
      .on('click', (e, d) => { 
        e.stopPropagation(); 
        selectNode(d.id); 
      })
      .on('contextmenu', (e, d) => {
        e.preventDefault();
        e.stopPropagation();
        if (callbacks.onContextMenu) callbacks.onContextMenu(e, d);
      })
      .call(drag);

    // Background rect (node-bg)
    nodesEnter.append('rect')
      .attr('class', 'node-bg')
      .attr('rx', 8)
      .attr('width', NODE_W)
      .attr('height', NODE_H)
      .attr('fill', 'var(--bg3)')
      .attr('stroke', d => String(d.id) === String(selectedNodeId) ? 'var(--accent)' : 'var(--border)')
      .attr('stroke-width', d => String(d.id) === String(selectedNodeId) ? 2 : 1.5);

    // Status vertical bar
    nodesEnter.append('rect')
      .attr('class', 'status-bar')
      .attr('x', NODE_W - 10)
      .attr('y', 4)
      .attr('width', 6)
      .attr('height', NODE_H - 8)
      .attr('rx', 3)
      .attr('fill', d => d.online === true ? 'var(--green)' : (d.online === false ? 'var(--red)' : 'var(--yellow)'))
      .style('animation', d => d.online === true ? 'status-pulse 1.5s ease-in-out infinite' : 'none');

    // Icon container
    nodesEnter.append('rect')
      .attr('class', 'device-icon')
      .attr('x', 10)
      .attr('y', 10)
      .attr('width', 40)
      .attr('height', 40)
      .attr('rx', 6)
      .attr('fill', 'var(--bg4)')
      .attr('stroke', 'var(--border)')
      .attr('stroke-width', 1);

    // Device icon
    const iconGroup = nodesEnter.append('g')
      .attr('transform', 'translate(10,10)');
    iconGroup.append('svg')
      .attr('viewBox', '0 0 24 24')
      .attr('width', 40)
      .attr('height', 40)
      .append('path')
      .attr('d', d => typeof NetworkIcons !== 'undefined' 
        ? NetworkIcons.get(d.device_type || d.type || 'unknown') 
        : getDeviceIconPath(d.device_type || d.type || 'unknown'))
      .attr('fill', 'var(--text)')
      .attr('stroke', 'none');

    // Device name
    nodesEnter.append('text')
      .attr('class', 'device-name')
      .attr('x', 60)
      .attr('y', 28)
      .attr('font-family', 'Inter, sans-serif')
      .attr('font-size', 13)
      .attr('font-weight', 600)
      .attr('fill', 'var(--text)')
      .text(d => (d.name || d.ip || 'Device ' + d.id).substring(0, 18));

    // Device IP
    nodesEnter.append('text')
      .attr('class', 'device-ip')
      .attr('x', 60)
      .attr('y', 46)
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', 11)
      .attr('fill', 'var(--text3)')
      .text(d => d.ip || '');

    // Anchor points for links (same as waypoints)
    const anchorsGroup = nodesEnter.append('g')
      .attr('class', 'node-anchors');

    // Top anchor
    anchorsGroup.append('circle')
      .attr('class', 'anchor')
      .attr('data-pos', 'top')
      .attr('cx', ANCHORS.top.x)
      .attr('cy', ANCHORS.top.y)
      .attr('r', 4)
      .attr('fill', 'var(--accent)')
      .attr('stroke', 'var(--bg3)')
      .attr('stroke-width', 2)
      .style('cursor', 'crosshair')
      .each(function(d) {
        d3.select(this).datum({ node: d, pos: 'top' });
      })
      .call(anchorDrag);

    // Right anchor
    anchorsGroup.append('circle')
      .attr('class', 'anchor')
      .attr('data-pos', 'right')
      .attr('cx', ANCHORS.right.x)
      .attr('cy', ANCHORS.right.y)
      .attr('r', 4)
      .attr('fill', 'var(--accent)')
      .attr('stroke', 'var(--bg3)')
      .attr('stroke-width', 2)
      .style('cursor', 'crosshair')
      .each(function(d) {
        d3.select(this).datum({ node: d, pos: 'right' });
      })
      .call(anchorDrag);

    // Bottom anchor
    anchorsGroup.append('circle')
      .attr('class', 'anchor')
      .attr('data-pos', 'bottom')
      .attr('cx', ANCHORS.bottom.x)
      .attr('cy', ANCHORS.bottom.y)
      .attr('r', 4)
      .attr('fill', 'var(--accent)')
      .attr('stroke', 'var(--bg3)')
      .attr('stroke-width', 2)
      .style('cursor', 'crosshair')
      .each(function(d) {
        d3.select(this).datum({ node: d, pos: 'bottom' });
      })
      .call(anchorDrag);

    // Left anchor
    anchorsGroup.append('circle')
      .attr('class', 'anchor')
      .attr('data-pos', 'left')
      .attr('cx', ANCHORS.left.x)
      .attr('cy', ANCHORS.left.y)
      .attr('r', 4)
      .attr('fill', 'var(--accent)')
      .attr('stroke', 'var(--bg3)')
      .attr('stroke-width', 2)
      .style('cursor', 'crosshair')
      .each(function(d) {
        d3.select(this).datum({ node: d, pos: 'left' });
      })
      .call(anchorDrag);

    // Mousemove handler to update temp line
    svg.on('mousemove', (e) => {
      if (linkDragState && linkDragState.sourceId) {
        const [x, y] = d3.pointer(e, container.node());
        setTempLine(linkDragState.sourceId, x, y);
      }
    });

    // Remove nodes that are no longer in the data
    nodesUpdate.exit().remove();
    
    // Update existing nodes
    nodesUpdate
      .attr('class', d => 'network-node' + (String(d.id) === String(selectedNodeId) ? ' selected' : ''))
      .attr('transform', d => `translate(${d.x || 0},${d.y || 0})`)
      .style('display', d => (!visibleIds || visibleIds.has(String(d.id)) ? 'block' : 'none'));

    // Merge enter + update
    const nodesMerge = nodesEnter.merge(nodesUpdate);

    // Update status bar
    nodesMerge.select('.status-bar')
      .attr('fill', d => d.online === true ? 'var(--green)' : (d.online === false ? 'var(--red)' : 'var(--yellow)'))
      .style('animation', d => d.online === true ? 'status-pulse 1.5s ease-in-out infinite' : 'none');

    // Update node background stroke
    nodesMerge.select('.node-bg')
      .attr('stroke', d => String(d.id) === String(selectedNodeId) ? 'var(--accent)' : 'var(--border)')
      .attr('stroke-width', d => String(d.id) === String(selectedNodeId) ? 2 : 1.5);

    // Update device icon path
    nodesMerge.select('g svg path')
      .attr('d', d => typeof NetworkIcons !== 'undefined' 
        ? NetworkIcons.get(d.device_type || d.type || 'unknown') 
        : getDeviceIconPath(d.device_type || d.type || 'unknown'));

    // Update device name
    nodesMerge.select('.device-name')
      .text(d => (d.name || d.ip || 'Device ' + d.id).substring(0, 18));

    // Update device IP
    nodesMerge.select('.device-ip')
      .text(d => d.ip || '');
  }

  function centerOnContent() {
    if (nodes.length === 0) {
      // If no nodes, reset to default position
      zoomTransform = d3.zoomIdentity;
      svg.transition().duration(750).call(zoomBehavior.transform, zoomTransform);
      return;
    }

    // Calculate the bounding box of all nodes
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    nodes.forEach(d => {
      const x = d.x || 0;
      const y = d.y || 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + NODE_W);
      maxY = Math.max(maxY, y + NODE_H);
    });

    // Add padding
    const padding = 100;
    const contentWidth = maxX - minX + padding * 2;
    const contentHeight = maxY - minY + padding * 2;

    // Calculate center
    const scale = Math.min(
      width / contentWidth,
      height / contentHeight,
      1 // Don't zoom in more than 100%
    );
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const translateX = width / 2 - centerX * scale;
    const translateY = height / 2 - centerY * scale;

    // Apply
    zoomTransform = d3.zoomIdentity.translate(translateX, translateY).scale(scale);
    svg.transition().duration(750).call(zoomBehavior.transform, zoomTransform);
  }

  function getNode(id) { return nodes.find(n => String(n.id) === String(id)); }

  function selectNode(id) {
    selectedNodeId = id;
    if (callbacks.onSelectNode) callbacks.onSelectNode(id ? getNode(id) : null);
    render(nodes, edges, lastVisibleIds);
  }

  function setTempLine(fromId, toX, toY, fromPos) {
    if (fromId) {
      const fromNode = getNode(fromId);
      if (fromNode) {
        tempLineGroup.style('display', null);
        tempLineGroup.selectAll('*').remove();
        // Используем сохраненную позицию якоря, если есть
        let startX, startY;
        if (fromPos && ANCHORS[fromPos]) {
          startX = fromNode.x + ANCHORS[fromPos].x;
          startY = fromNode.y + ANCHORS[fromPos].y;
        } else {
          startX = fromNode.x + NODE_W / 2;
          startY = fromNode.y + NODE_H / 2;
        }
        tempLineGroup.append('line')
          .attr('x1', startX)
          .attr('y1', startY)
          .attr('x2', toX)
          .attr('y2', toY)
          .attr('stroke', 'var(--accent)')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '5,5');
      }
    } else {
      tempLineGroup.style('display', 'none');
    }
  }

  function getDeviceIconPath(type) {
    const icons = {
      router: 'M12 2L6 6v12l6 4l6-4V6l-6-4zm0 2l4 3-4 3-4-3 4-3zm-4 5v6l4 2 4-2v-6l-4 2-4-2z',
      switch: 'M3 6h18v18v2H3v-2zm0 5h18v2H3v-2zm0 5h18v2H3v-2zm0 5h18v2H3v-2z',
      server: 'M20 3H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H4V5h16v16zM6 6h8v2H6V6zm0 4h8v2H6v-2zm0 4h5v2H6v-2z',
      nas: 'M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H4V4h16v16zM6 10h8v2H6v-2zm0 4h8v2H6v-2zm0-8h8v2H6V6z',
      camera: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-12.5c-2.49 0-4.5 2.01-4.5 4.5s2.01 4.5 4.5 4.5 4.5-2.01 4.5-4.5-2.01-4.5-4.5-4.5z',
      printer: 'M19 8H5V3H1v11h4v3h14v-3h4V8zm-1 9c.55 0 1 .45 1 1s-.45 1-1 1s-1-.45-1-1 .45-1 1-1zm-6 5H8v-3h4v3z',
      pc: 'M20 3H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h4v2H7v2h10v-2h-1v-2h4c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 12H4V5h16v10z',
      mobile: 'M17 1.01L7 1c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z',
      iot: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z',
      firewall: 'M12 1L3 5v14l9 4 9-4V5l-9-4zm0 2.18L19 6.5v7.82L12 15.82 5 14.82V6.5l7-3.32z',
      vm: 'M19 3H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 7h5v2H7V7zm0 4h5v2H7v-2zm0 4h5v2H7v-2z',
      lxc: 'M19 3H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z',
      coordinator: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm1-10h-2v2h2v-2zm0-4h-2v2h2V6z',
      'zigbee-router': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm1-10h-2v2h2v-2z',
      'end-device': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z',
      hub: 'M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18L19 7v7.82l-7 3.5L5 14.82V7l7-2.82z',
      'access-point': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h-2v6h2v-6z',
      display: 'M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z',
      sensor: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm1-13h-2v2h2v-2zm0 4h-2v2h2v-2z',
      actuator: 'M19 3H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v4H7v-4zm4-4h2v2h-2V6zm0 8h2v2h-2v-2zm4-4h2v4h-2v-4z',
      gateway: 'M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H4V4h16v16z',
      unknown: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z'
    };
    return icons[type] || icons.unknown;
  }

  function showNodeTooltip(e, d) {
    let tooltip = document.getElementById('nodeTooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'nodeTooltip';
      tooltip.className = 'node-tooltip';
      document.body.appendChild(tooltip);
    }
    let html = `<strong>${d.name || d.ip || 'Device ' + d.id}</strong>`;
    if (d.ip) html += `<br>${d.ip}`;
    if (d.mac) html += `<div>MAC: ${d.mac}</div>`;
    if (d.vendor) html += `<div>Vendor: ${d.vendor}</div>`;
    tooltip.innerHTML = html;
    tooltip.style.left = e.pageX + 10 + 'px';
    tooltip.style.top = e.pageY + 10 + 'px';
    tooltip.style.display = 'block';
  }

  function hideTooltip() {
    const tooltip = document.getElementById('nodeTooltip');
    if (tooltip) tooltip.style.display = 'none';
  }

  function zoomIn() {
    svg.transition().duration(300).call(zoomBehavior.scaleBy, 1.3);
  }

  function zoomOut() {
    svg.transition().duration(300).call(zoomBehavior.scaleBy, 1/1.3);
  }

  function zoomFit() {
    centerOnContent();
  }

  function exportMap() {
    return {
      nodes: nodes.map(d => ({ id: d.id, x: d.x, y: d.y, name: d.name })),
      edges: edges.map(d => ({ id: d.id, source: d.source_id, target: d.target_id, type: d.type, label: d.label }))
    };
  }

  return {
    init, render, setTool, toggleGrid, toggleLinkLabels, zoomIn, zoomOut, zoomFit, selectNode,
    setTempLine, exportMap
  };
})();
