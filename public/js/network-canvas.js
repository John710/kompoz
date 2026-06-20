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
    .attr('stroke-opacity', 0.3);
  const container = svg.append('g').attr('class', 'container');
  const gridGroup = container.append('g').attr('class', 'grid');
  const edgesGroup = container.append('g').attr('class', 'edges');
  const nodesGroup = container.append('g').attr('class', 'nodes');

  let width = 0, height = 0;
  let zoomTransform = d3.zoomIdentity;
  let tool = 'pan';
  let nodes = [], edges = [];
  let selectedNodeId = null;
  let callbacks = {};
  let gridVisible = true;
  const NODE_W = 160, NODE_H = 64;

  const tempLineGroup = container.append('g').attr('class', 'temp-line').style('display', 'none');
  let linkDragState = null;

  const EDGE_STYLES = {
    ethernet:  { dash: '0',    color: 'var(--text3)', width: 1.5 },
    wifi:      { dash: '4,3',  color: 'var(--accent)', width: 1.5 },
    vpn:       { dash: '8,4',  color: 'var(--purple)', width: 2 },
    docker:    { dash: '2,2',  color: 'var(--green)', width: 1.5 },
    lxc:       { dash: '6,3,2,3', color: 'var(--yellow)', width: 1.5 },
  };

  function init(cb) {
    callbacks = cb || {};
    const wrapper = document.querySelector('.canvas-wrapper');
    width = wrapper.clientWidth;
    height = wrapper.clientHeight;
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const zoom = d3.zoom()
      .scaleExtent([0.2, 4])
      .on('zoom', (e) => {
        zoomTransform = e.transform;
        container.attr('transform', e.transform);
      });
    svg.call(zoom).on('dblclick.zoom', null);

    svg.on('click', (e) => {
      if (e.target.id === 'networkSvg') {
        selectNode(null);
        hideTooltip();
      }
    });

    drawGrid();
    window.addEventListener('resize', () => {
      width = wrapper.clientWidth;
      height = wrapper.clientHeight;
      svg.attr('viewBox', `0 0 ${width} ${height}`);
      drawGrid();
    });
  }

  function setTool(t) {
    tool = t;
    svg.style('cursor', tool === 'pan' ? 'grab' : 'default');
  }

  function toggleGrid() {
    gridVisible = !gridVisible;
    gridGroup.style('display', gridVisible ? 'block' : 'none');
    return gridVisible;
  }

  function drawGrid() {
    gridGroup.selectAll('*').remove();
    if (!gridVisible) return;
    gridGroup.append('rect')
      .attr('x', -100000)
      .attr('y', -100000)
      .attr('width', 200000)
      .attr('height', 200000)
      .attr('fill', 'url(#gridPattern)');
  }

  function render(dataNodes, dataEdges) {
    nodes = dataNodes;
    edges = dataEdges;
    renderEdges();
    renderNodes();
  }

  function renderEdges() {
    const link = edgesGroup.selectAll('.network-edge').data(edges, d => d.id);
    link.exit().remove();
    const linkEnter = link.enter().append('g').attr('class', 'network-edge');
    linkEnter.append('line').attr('class', 'edge-line');
    linkEnter.append('text').attr('class', 'edge-label').attr('text-anchor', 'middle').attr('dy', -4);
    const linkMerge = linkEnter.merge(link);
    linkMerge.select('.edge-line')
      .attr('x1', d => (getNode(d.source_id)?.x || 0) + NODE_W / 2)
      .attr('y1', d => (getNode(d.source_id)?.y || 0) + NODE_H / 2)
      .attr('x2', d => (getNode(d.target_id)?.x || 0) + NODE_W / 2)
      .attr('y2', d => (getNode(d.target_id)?.y || 0) + NODE_H / 2)
      .attr('stroke-dasharray', d => EDGE_STYLES[d.type]?.dash || '0')
      .attr('stroke', d => EDGE_STYLES[d.type]?.color || 'var(--text3)')
      .attr('stroke-width', d => EDGE_STYLES[d.type]?.width || 1.5);
    linkMerge.select('.edge-label')
      .attr('x', d => {
        const sx = (getNode(d.source_id)?.x || 0) + NODE_W / 2;
        const tx = (getNode(d.target_id)?.x || 0) + NODE_W / 2;
        return (sx + tx) / 2;
      })
      .attr('y', d => {
        const sy = (getNode(d.source_id)?.y || 0) + NODE_H / 2;
        const ty = (getNode(d.target_id)?.y || 0) + NODE_H / 2;
        return (sy + ty) / 2;
      })
      .text(d => d.label || d.type || '');
  }

  function renderNodes() {
    const node = nodesGroup.selectAll('.network-node').data(nodes, d => d.id);
    node.exit().remove();
    const nodeEnter = node.enter().append('g').attr('class', 'network-node')
      .attr('transform', d => `translate(${d.x || 0},${d.y || 0})`)
      .on('mouseenter', (e, d) => showNodeTooltip(e, d))
      .on('mouseleave', hideTooltip)
      .on('mousedown', (e, d) => {
        if (tool === 'select') { e.stopPropagation(); selectNode(d.id); }
      })
      .on('contextmenu', (e, d) => {
        e.preventDefault();
        if (callbacks.onContextMenu) callbacks.onContextMenu(e, d);
      })
      .call(d3.drag()
        .on('start', function(e, d) {
          if (tool !== 'pan') { e.sourceEvent.stopPropagation(); }
          d3.select(this).raise();
        })
        .on('drag', function(e, d) {
          if (tool !== 'pan') return;
          d.x = (d.x || 0) + e.dx / zoomTransform.k;
          d.y = (d.y || 0) + e.dy / zoomTransform.k;
          d3.select(this).attr('transform', `translate(${d.x},${d.y})`);
          renderEdges();
        })
        .on('end', function(e, d) {
          if (tool === 'pan' && callbacks.onNodeMove) callbacks.onNodeMove(d);
        })
      );

    const card = nodeEnter.append('g').attr('class', 'node-card');
    card.append('rect').attr('width', NODE_W).attr('height', NODE_H).attr('rx', 8)
      .attr('fill', 'var(--panel)').attr('stroke', 'var(--border)').attr('stroke-width', 1);
    // Pulse ring for online devices
    card.append('circle').attr('class', 'pulse-ring')
      .attr('cx', NODE_W - 12).attr('cy', 12).attr('r', 6)
      .attr('fill', 'none').attr('stroke', d => d.online ? 'var(--green)' : 'none')
      .attr('stroke-width', 1).attr('opacity', 0.6);
    card.append('rect').attr('width', 4).attr('height', NODE_H).attr('rx', 2)
      .attr('fill', d => d.online ? 'var(--green)' : 'var(--red)');
    card.append('svg:foreignObject').attr('x', 12).attr('y', 16).attr('width', 32).attr('height', 32)
      .append('xhtml:div').style('width', '32px').style('height', '32px').style('color', 'var(--accent)')
      .html(d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${NetworkIcons.get(d.device_type || 'unknown')}</svg>`);
    card.append('text').attr('x', 52).attr('y', 26).attr('class', 'node-name')
      .attr('fill', 'var(--text)').attr('font-size', '13px').attr('font-weight', '600')
      .text(d => d.name || d.ip || 'Unknown');
    card.append('text').attr('x', 52).attr('y', 44).attr('class', 'node-ip')
      .attr('fill', 'var(--text2)').attr('font-size', '11px').attr('font-family', 'JetBrains Mono, monospace')
      .text(d => d.ip || '');
    card.append('circle').attr('cx', NODE_W - 12).attr('cy', 12).attr('r', 4)
      .attr('fill', d => d.online ? 'var(--green)' : 'var(--red)')
      .attr('stroke', 'var(--panel)').attr('stroke-width', 2);

    // Anchor points for link creation
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
        .on('mousedown', (e) => {
          e.stopPropagation();
          startLinkDrag(e, d, a);
        });
    });

    // Show anchors on node hover
    nodeEnter.on('mouseenter', function() {
      d3.select(this).selectAll('.anchor').style('opacity', 0.7);
    }).on('mouseleave', function() {
      if (!linkDragState) d3.select(this).selectAll('.anchor').style('opacity', 0);
    });

    // Update selection state
    nodeEnter.merge(node)
      .attr('transform', d => `translate(${d.x || 0},${d.y || 0})`)
      .attr('class', d => 'network-node' + (d.id === selectedNodeId ? ' selected' : ''));

    // Animate pulse rings for online nodes
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
    tt.innerHTML = '';
    const ports = (d.ports || []).join(', ') || '—';

    const title = document.createElement('div');
    title.style.fontWeight = '600';
    title.style.marginBottom = '4px';
    title.textContent = d.name || d.ip || 'Unknown';
    tt.appendChild(title);

    const body = document.createElement('div');
    body.style.fontFamily = 'var(--mono)';
    body.style.fontSize = '11px';
    body.style.color = 'var(--text2)';

    const addRow = (label, value) => {
      const row = document.createElement('div');
      row.textContent = label + value;
      body.appendChild(row);
    };

    addRow('IP: ', d.ip || '—');
    addRow('MAC: ', d.mac || '—');
    addRow('Type: ', d.device_type || 'unknown');

    const statusRow = document.createElement('div');
    statusRow.appendChild(document.createTextNode('Status: '));
    const statusSpan = document.createElement('span');
    statusSpan.textContent = d.online ? 'Online' : 'Offline';
    statusSpan.style.color = d.online ? 'var(--green)' : 'var(--red)';
    statusRow.appendChild(statusSpan);
    body.appendChild(statusRow);

    addRow('Ports: ', ports);
    tt.appendChild(body);

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

  function zoomIn() { svg.transition().duration(200).call(d3.zoom().transform, zoomTransform.scale(1.2)); }
  function zoomOut() { svg.transition().duration(200).call(d3.zoom().transform, zoomTransform.scale(0.833)); }
  function zoomFit() {
    if (!nodes.length) return;
    const xs = nodes.map(n => n.x || 0), ys = nodes.map(n => n.y || 0);
    const minX = Math.min(...xs), maxX = Math.max(...xs) + NODE_W;
    const minY = Math.min(...ys), maxY = Math.max(...ys) + NODE_H;
    const dx = maxX - minX, dy = maxY - minY;
    const scale = Math.min(width / dx, height / dy, 1) * 0.9;
    const tx = (width - dx * scale) / 2 - minX * scale;
    const ty = (height - dy * scale) / 2 - minY * scale;
    svg.transition().duration(400).call(d3.zoom().transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
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
    // Highlight target anchors under cursor
    nodesGroup.selectAll('.anchor').attr('r', 5);
    const el = document.elementFromPoint(e.sourceEvent.clientX, e.sourceEvent.clientY);
    if (el && el.classList && el.classList.contains('anchor')) {
      d3.select(el).attr('r', 9);
    }
  }

  function endLinkDrag(e) {
    svg.on('mousemove.linkdrag', null).on('mouseup.linkdrag', null);
    if (!linkDragState) return;
    const el = document.elementFromPoint(e.sourceEvent.clientX, e.sourceEvent.clientY);
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
    return { nodes: nodes.map(n => ({ id: n.id, x: n.x, y: n.y, name: n.name, type: n.device_type })), edges };
  }

  return { init, render, setTool, selectNode, zoomIn, zoomOut, zoomFit, toggleGrid, getNode, exportMap, nodes: () => nodes, edges: () => edges };
})();
