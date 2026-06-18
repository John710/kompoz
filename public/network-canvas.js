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
  let callbacks = {};
  let gridVisible = true;
  let showLinkLabels = true;
  const NODE_W = 160, NODE_H = 64;

  const tempLineGroup = container.append('g').attr('class', 'temp-line').style('display', 'none').style('pointer-events', 'none');
  let linkDragState = null;

  const EDGE_STYLES = {
    ethernet:   { dash: '0',         color: 'var(--text3)',  width: 1.5, animate: false, wavy: false },
    wifi:       { dash: '6,3',       color: 'var(--accent)', width: 1.5, animate: true,  wavy: false },
    vpn:        { dash: '8,4',       color: 'var(--purple)', width: 2,   animate: false, wavy: false },
    docker:     { dash: '0',         color: 'var(--green)',  width: 1.5, animate: false, wavy: true  },
    lxc:        { dash: '0',         color: 'var(--yellow)', width: 1.5, animate: false, wavy: true  },
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

  function init(cb) {
    callbacks = cb || {};
    const wrapper = document.querySelector('.canvas-wrapper');
    width = wrapper.clientWidth;
    height = wrapper.clientHeight;
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    drawGrid();

    zoomBehavior = d3.zoom()
      .scaleExtent([0.2, 4])
      .on('zoom', (e) => {
        zoomTransform = e.transform;
        container.attr('transform', e.transform);
      });
    svg.call(zoomBehavior).on('dblclick.zoom', null);

    svg.on('click', (e) => {
      if (e.target.id === 'networkSvg') {
        selectNode(null);
        hideTooltip();
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
    nodes = dataNodes;
    edges = dataEdges;
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
    if (len < 4) return 'M' + x1 + ',' + y1 + ' L' + x2 + ',' + y2;
    var amp = 4;
    var waveLen = 10;
    var numWaves = Math.max(2, Math.round(len / waveLen));
    var angle = Math.atan2(dy, dx);
    var px = -Math.sin(angle) * amp;
    var py = Math.cos(angle) * amp;
    var sx = dx / numWaves;
    var sy = dy / numWaves;
    var d = 'M' + x1 + ',' + y1;
    for (var i = 0; i < numWaves; i++) {
      var qx = x1 + sx * (i + 0.5) + px * (i % 2 === 0 ? 1 : -1);
      var qy = y1 + sy * (i + 0.5) + py * (i % 2 === 0 ? 1 : -1);
      var ex = x1 + sx * (i + 1);
      var ey = y1 + sy * (i + 1);
      d += ' Q' + qx.toFixed(1) + ',' + qy.toFixed(1) + ' ' + ex.toFixed(1) + ',' + ey.toFixed(1);
    }
    return d;
  }

  function makeEdgePath(x1, y1, x2, y2, type) {
    const style = EDGE_STYLES[type] || EDGE_STYLES.ethernet;
    const { sPos, tPos } = getBestAnchors(x1, y1, x2, y2);
    const sAx = x1 + ANCHORS[sPos].x, sAy = y1 + ANCHORS[sPos].y;
    const tAx = x2 + ANCHORS[tPos].x, tAy = y2 + ANCHORS[tPos].y;
    if (style.wavy) {
      return makeWavyPath(sAx, sAy, tAx, tAy);
    }
    // Manhattan routing
    let d = 'M' + sAx + ',' + sAy;
    const midX = (sAx + tAx) / 2;
    const midY = (sAy + tAy) / 2;
    if (sPos === 'left' || sPos === 'right') {
      d += ' L' + midX + ',' + sAy + ' L' + midX + ',' + tAy + ' L' + tAx + ',' + tAy;
    } else {
      d += ' L' + sAx + ',' + midY + ' L' + tAx + ',' + midY + ' L' + tAx + ',' + tAy;
    }
    return d;
  }

  function renderEdges(visibleIds) {
    const link = edgesGroup.selectAll('.network-edge').data(edges, d => d.id);
    link.exit().remove();
    const linkEnter = link.enter().append('g').attr('class', 'network-edge');
    linkEnter.append('path').attr('class', 'edge-line');
    const labelEnter = linkEnter.append('text').attr('class', 'edge-label')
      .attr('text-anchor', 'middle').attr('dy', -4)
      .style('cursor', 'pointer');
    labelEnter.on('dblclick', (e, d) => {
      e.stopPropagation();
      const raw = d.label || d.type || '';
      const newLabel = prompt((typeof I18N !== 'undefined' ? I18N.t('linkLabel') : 'Label') + ':', raw);
      if (newLabel !== null && callbacks.onLinkEdit) {
        callbacks.onLinkEdit({ ...d, label: newLabel.trim() || d.type });
      }
    });
    const linkMerge = linkEnter.merge(link);

    linkMerge.style('display', d => {
      if (!visibleIds) return 'block';
      return (visibleIds.has(d.source_id) && visibleIds.has(d.target_id)) ? 'block' : 'none';
    });

    linkMerge.select('.edge-line')
      .attr('d', d => {
        const s = getNode(d.source_id), t = getNode(d.target_id);
        if (!s || !t) return 'M0,0';
        return makeEdgePath(s.x || 0, s.y || 0, t.x || 0, t.y || 0, d.type);
      })
      .attr('stroke-dasharray', d => EDGE_STYLES[d.type]?.dash || '0')
      .attr('stroke', d => EDGE_STYLES[d.type]?.color || 'var(--text3)')
      .attr('stroke-width', d => EDGE_STYLES[d.type]?.width || 1.5)
      .style('animation', d => EDGE_STYLES[d.type]?.animate ? 'flow 1s linear infinite' : null)
      .attr('fill', 'none');

    linkMerge.select('.edge-label')
      .style('display', d => showLinkLabels && (d.label || d.type) ? 'block' : 'none')
      .attr('x', d => {
        const s = getNode(d.source_id), t = getNode(d.target_id);
        if (!s || !t) return 0;
        const { sPos, tPos } = getBestAnchors(s.x || 0, s.y || 0, t.x || 0, t.y || 0);
        const sAx = (s.x || 0) + ANCHORS[sPos].x, tAx = (t.x || 0) + ANCHORS[tPos].x;
        return (sAx + tAx) / 2;
      })
      .attr('y', d => {
        const s = getNode(d.source_id), t = getNode(d.target_id);
        if (!s || !t) return 0;
        const { sPos, tPos } = getBestAnchors(s.x || 0, s.y || 0, t.x || 0, t.y || 0);
        const sAy = (s.y || 0) + ANCHORS[sPos].y, tAy = (t.y || 0) + ANCHORS[tPos].y;
        return (sAy + tAy) / 2;
      })
      .text(d => {
        const raw = d.label || d.type || '';
        let label = typeof I18N !== 'undefined' ? I18N.t('linkType_' + raw, { fallback: raw }) : raw;
        return label.length > 20 ? label.slice(0, 18) + '\u2026' : label;
      });
  }

  function renderNodes(visibleIds) {
    const node = nodesGroup.selectAll('.network-node').data(nodes, d => d.id);
    node.exit().style('display', 'none');

    const nodeEnter = node.enter().append('g').attr('class', 'network-node')
      .attr('transform', d => `translate(${d.x || 0},${d.y || 0})`)
      .raise()
      .on('mouseenter', (e, d) => showNodeTooltip(e, d))
      .on('mouseleave', hideTooltip)
      .on('mousedown', (e, d) => { selectNode(d.id); })
      .on('contextmenu', (e, d) => {
        e.preventDefault();
        if (callbacks.onContextMenu) callbacks.onContextMenu(e, d);
      })
      .call(d3.drag()
        .on('start', function(e, d) {
          e.sourceEvent.stopPropagation();
          d3.select(this).raise();
        })
        .on('drag', function(e, d) {
          d.x = (d.x || 0) + e.dx / zoomTransform.k;
          d.y = (d.y || 0) + e.dy / zoomTransform.k;
          d3.select(this).attr('transform', `translate(${d.x},${d.y})`);
          renderEdges(visibleIds);
        })
        .on('end', function(e, d) {
          if (callbacks.onNodeMove) callbacks.onNodeMove(d);
        })
      );

    const card = nodeEnter.append('g').attr('class', 'node-card');
    card.append('rect').attr('class', 'card-bg')
      .attr('width', NODE_W).attr('height', NODE_H).attr('rx', 8)
      .attr('fill', 'var(--panel)').attr('stroke', 'var(--border)').attr('stroke-width', 1);
    card.append('circle').attr('class', 'pulse-ring')
      .attr('cx', NODE_W - 12).attr('cy', 12).attr('r', 6)
      .attr('fill', 'none')
      .attr('stroke', d => d.online === true ? 'var(--green)' : d.online === false ? 'var(--red)' : 'var(--yellow)')
      .attr('stroke-width', 1).attr('opacity', 0.6);
    card.append('rect').attr('class', 'status-bar')
      .attr('width', 4).attr('height', NODE_H).attr('rx', 2)
      .attr('fill', d => d.online === true ? 'var(--green)' : d.online === false ? 'var(--red)' : 'var(--yellow)');
    const iconWrap = card.append('svg:foreignObject').attr('class', 'icon-wrapper')
      .attr('x', 12).attr('y', 16).attr('width', 32).attr('height', 32);
    iconWrap.append('xhtml:div')
      .style('width', '32px').style('height', '32px').style('color', 'var(--accent)')
      .html(d => `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5'>${NetworkIcons.get(d.device_type || d.type || 'unknown')}</svg>`);
    card.append('text').attr('class', 'node-name')
      .attr('x', 52).attr('y', 26)
      .attr('fill', 'var(--text)').attr('font-size', '13px').attr('font-weight', '600')
      .text(d => d.name || d.ip || 'Unknown');
    card.append('text').attr('class', 'node-ip')
      .attr('x', 52).attr('y', 44)
      .attr('fill', 'var(--text2)').attr('font-size', '11px').attr('font-family', 'JetBrains Mono, monospace')
      .text(d => d.ip || '');
    card.append('circle').attr('class', 'status-dot')
      .attr('cx', NODE_W - 12).attr('cy', 12).attr('r', 4)
      .attr('fill', d => d.online === true ? 'var(--green)' : d.online === false ? 'var(--red)' : 'var(--yellow)')
      .attr('stroke', 'var(--panel)').attr('stroke-width', 2);

    const anchors = card.append('g').attr('class', 'node-anchors');
    const anchorPositions = [
      { pos: 'top', cx: NODE_W / 2, cy: 0 },
      { pos: 'right', cx: NODE_W, cy: NODE_H / 2 },
      { pos: 'bottom', cx: NODE_W / 2, cy: NODE_H },
      { pos: 'left', cx: 0, cy: NODE_H / 2 }
    ];
    anchorPositions.forEach(a => {
      anchors.append('circle')
        .attr('class', 'anchor')
        .attr('cx', a.cx).attr('cy', a.cy).attr('r', 5)
        .attr('fill', 'var(--accent)')
        .attr('stroke', 'var(--panel)').attr('stroke-width', 1)
        .style('opacity', 0).style('cursor', 'crosshair')
        .on('mouseenter', function() { d3.select(this).style('opacity', 1).attr('r', 7); })
        .on('mouseleave', function() { d3.select(this).style('opacity', 0).attr('r', 5); })
        .on('mousedown', (e, d_node) => {
          e.stopPropagation();
          startLinkDrag(e, d_node, a);
        })
        .style('pointer-events', 'all');
    });

    nodeEnter.on('mouseenter', function() {
      d3.select(this).selectAll('.anchor').style('opacity', 0.7);
    }).on('mouseleave', function() {
      if (!linkDragState) d3.select(this).selectAll('.anchor').style('opacity', 0);
    });

    const nodeMerge = nodeEnter.merge(node);
    nodeMerge
      .attr('transform', d => `translate(${d.x || 0},${d.y || 0})`)
      .attr('class', d => 'network-node' + (d.id === selectedNodeId ? ' selected' : ''))
      .style('display', d => !visibleIds || visibleIds.has(d.id) ? 'block' : 'none');

    nodeMerge.each(function(d) {
      const el = d3.select(this);
      const online = d.online;
      const color = online === true ? 'var(--green)' : online === false ? 'var(--red)' : 'var(--yellow)';
      const devType = d.device_type || d.type || 'unknown';

      el.select('.icon-wrapper div').html(
        `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5'>${NetworkIcons.get(devType)}</svg>`
      );
      el.select('.node-name').text(d.name || d.ip || 'Unknown');
      el.select('.node-ip').text(d.ip || '');
      el.select('.pulse-ring').attr('stroke', color);
      el.select('.status-bar').attr('fill', color);
      el.select('.status-dot').attr('fill', color);
    });

    nodesGroup.selectAll('.pulse-ring')
      .transition().duration(1500).ease(d3.easeSinInOut)
      .attr('r', 12).attr('opacity', 0)
      .transition().duration(0).attr('r', 6).attr('opacity', 0.6)
      .on('end', function repeat() {
        d3.select(this).transition().duration(1500).ease(d3.easeSinInOut)
          .attr('r', 12).attr('opacity', 0)
          .transition().duration(0).attr('r', 6).attr('opacity', 0.6)
          .on('end', repeat);
      });
  }

  function showNodeTooltip(e, d) {
    const tt = document.getElementById('tooltip');
    const ports = (d.ports || []).join(', ') || '\u2014';
    const devType = d.device_type || d.type || 'unknown';
    const typeLabel = typeof I18N !== 'undefined'
      ? I18N.t('deviceType_' + devType, { fallback: devType })
      : devType;
    const statusText = d.online === true ? '<span style="color:var(--green)">Online</span>'
      : d.online === false ? '<span style="color:var(--red)">Offline</span>'
      : '<span style="color:var(--yellow)">Unknown</span>';
    tt.innerHTML = `
      <div style='font-weight:600;margin-bottom:4px;'>${d.name || d.ip || 'Unknown'}</div>
      <div style='font-family:var(--mono);font-size:11px;color:var(--text2);'>
        <div>IP: ${d.ip || '\u2014'}</div>
        <div>MAC: ${d.mac || '\u2014'}</div>
        <div>Type: ${typeLabel}</div>
        <div>Status: ${statusText}</div>
        <div>Ports: ${ports}</div>
      </div>
    `;
    tt.style.left = (e.pageX + 12) + 'px';
    tt.style.top = (e.pageY + 12) + 'px';
    tt.classList.add('visible');
  }

  function hideTooltip() {
    document.getElementById('tooltip').classList.remove('visible');
  }

  function getNode(id) { return nodes.find(n => n.id === id); }
  function selectNode(id) {
    selectedNodeId = id;
    renderNodes();
    if (callbacks.onSelectNode) callbacks.onSelectNode(id ? getNode(id) : null);
  }
  function highlightNode(id, on) {
    nodesGroup.selectAll('.network-node').filter(d => d.id === id)
      .select('.node-card rect:first-child').attr('stroke', on ? 'var(--accent)' : 'var(--border)');
  }

  function zoomIn() {
    zoomTransform = zoomTransform.scale(1.2);
    svg.transition().duration(200).call(zoomBehavior.transform, zoomTransform);
  }
  function zoomOut() {
    zoomTransform = zoomTransform.scale(0.833333);
    svg.transition().duration(200).call(zoomBehavior.transform, zoomTransform);
  }
  function zoomFit() {
    if (!nodes.length) return;
    const xs = nodes.map(n => n.x || 0), ys = nodes.map(n => n.y || 0);
    const minX = Math.min(...xs), maxX = Math.max(...xs) + NODE_W;
    const minY = Math.min(...ys), maxY = Math.max(...ys) + NODE_H;
    const dx = maxX - minX, dy = maxY - minY;
    const scale = Math.min(width / dx, height / dy, 1) * 0.9;
    const tx = (width - dx * scale) / 2 - minX * scale;
    const ty = (height - dy * scale) / 2 - minY * scale;
    zoomTransform = d3.zoomIdentity.translate(tx, ty).scale(scale);
    svg.transition().duration(400).call(zoomBehavior.transform, zoomTransform);
  }

  function startLinkDrag(e, sourceNode, anchor) {
    e.preventDefault();
    linkDragState = { sourceId: sourceNode.id, sourceAnchor: anchor };
    tempLineGroup.style('display', 'block');
    const [sx, sy] = getAnchorScreenPos(sourceNode, anchor);
    tempLineGroup.append('line').attr('class', 'temp-link-line')
      .attr('x1', sx).attr('y1', sy)
      .attr('x2', sx).attr('y2', sy)
      .attr('stroke', 'var(--accent)').attr('stroke-width', 2)
      .attr('stroke-dasharray', '4,2');
    svg.on('mousemove.linkdrag', (ev) => updateLinkDrag(ev));
    svg.on('mouseup.linkdrag', (ev) => endLinkDrag(ev));
  }

  function updateLinkDrag(e) {
    if (!linkDragState) return;
    const [sx, sy] = getAnchorScreenPos(getNode(linkDragState.sourceId), linkDragState.sourceAnchor);
    const [mx, my] = d3.pointer(e, container.node());
    tempLineGroup.select('.temp-link-line')
      .attr('x1', sx).attr('y1', sy)
      .attr('x2', mx).attr('y2', my);
    nodesGroup.selectAll('.anchor').attr('r', 5);
    const el = document.elementFromPoint((e.sourceEvent || e).clientX, (e.sourceEvent || e).clientY);
    if (el && el.classList && el.classList.contains('anchor')) {
      d3.select(el).attr('r', 9);
    }
  }

  function endLinkDrag(e) {
    svg.on('mousemove.linkdrag', null).on('mouseup.linkdrag', null);
    if (!linkDragState) return;
    const el = document.elementFromPoint((e.sourceEvent || e).clientX, (e.sourceEvent || e).clientY);
    let targetId = null;
    if (el && el.classList && el.classList.contains('anchor')) {
      const nodeEl = el.closest('.network-node');
      if (nodeEl) {
        const d = d3.select(nodeEl).datum();
        if (d && d.id !== linkDragState.sourceId) targetId = d.id;
      }
    }
    tempLineGroup.style('display', 'none').selectAll('*').remove();
    nodesGroup.selectAll('.anchor').style('opacity', 0).attr('r', 5);
    if (targetId && callbacks.onCreateLink) {
      callbacks.onCreateLink(linkDragState.sourceId, targetId);
    }
    linkDragState = null;
  }

  function getAnchorScreenPos(node, anchor) {
    const nx = node.x || 0;
    const ny = node.y || 0;
    return [nx + anchor.cx, ny + anchor.cy];
  }

  function exportMap() {
    return { nodes: nodes.map(n => ({ id: n.id, x: n.x, y: n.y, name: n.name, type: n.device_type || n.type })), edges };
  }

  return { init, render, setTool, selectNode, zoomIn, zoomOut, zoomFit, toggleGrid, getNode, exportMap, toggleLinkLabels, nodes: () => nodes, edges: () => edges };
})();
