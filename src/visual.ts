/*
 *  Power BI Visual CLI
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

module powerbi.extensibility.visual {
    "use strict";

    interface DataPoint {
        parent: string;
        name: string;
        revenue: number;
    }

    interface ViewModel {
        dataPoints: DataPoint[];
        // x0: number;
        // y0: number;
    }


    export class Visual implements IVisual {
        private host: IVisualHost;
        private opts: powerbi.extensibility.visual.VisualUpdateOptions;
        private svg: d3.Selection<SVGElement>;
        private nodeGroup: d3.Selection<SVGElement>;
        private treeCreate = eval("d3.stratify()").id( function(d: DataPoint): string { return d.name;}).parentId( function(d: DataPoint): string { return d.parent;});
        private source: any = null;
        private root = null;
        private oldRevVal = [];
        private changeRevVal: boolean = false;
        private isRevenue: boolean;
        // private compressInit: boolean = true;
        private vizInit: boolean = true; // 
        private collapseBool: boolean = true;
        private margin;
        private tabWidth: number;     // width of the entire table
        private indent: number = 25;        // amount a child node is indented
        private txtIndent: number = 5.5;    // indent text within each rectangle
        private barHeight: number = 30;     // height of each bar
        private barWidth: number;           // width of individual bars
        private duration: number = 400;     // duration of the animation

        constructor(options: VisualConstructorOptions) {
            // set values utilized in 

            this.margin = {top: 30, bottom: 30, left: 20, right: 20};
            this.tabWidth = 600 - this.margin.left - this.margin.right;
            // this.oldViewPort = {height: 0, width: 0};

            // sets scrollbars to only show on y axis
            options.element.style.overflowY = "auto"
            options.element.style.overflowX = "hidden"

            this.svg = d3.select(options.element).append("svg")
                .attr("width", this.tabWidth)
                .classed("svg", true);

            this.nodeGroup = this.svg.append("g")
                .attr("transform", "translate(" + this.margin.left + "," + this.margin.top +")")
                .classed("node-group", true);
            }
        
        public update(options: VisualUpdateOptions) { 

            this.opts = options;
            this.barWidth = this.tabWidth;

            // create viewModel to hold the data
            let viewModel = this.getViewModel(options);
            if (this.vizInit) {
                // initialize the tree
                this.root = this.treeCreate(viewModel.dataPoints);  // create hierarchy relationship from data
                this.root.sum(function(d) { return d["revenue"]});      // sum all the revenue data
                this.root.each( function(d) { d.x0 = 0; d.y0 = 0;});    // create starting positions for each element
                
                // collapse the hierarchy so that only the top nodes are showing
                this.collapse(this.root);
            } else {
                // update the tree

                // get new tree incorporating the new revenue values
                let fakeRoot = this.treeCreate(viewModel.dataPoints);
                // accumulate the revenue up the tree
                fakeRoot.sum(function(d) { return d["revenue"]});
                // update current tree to include updated revenue
                this.updateVals(this.root, fakeRoot);
            }
            this.clickUpdate(this.root)

        }

        private clickUpdate(source: Array<d3.layout.tree.Node> | d3.layout.tree.Node[] | Node[] | Node) {
            // options from the visual
            let height = this.opts.viewport.height;
            let width = this.opts.viewport.width;

            // generate layout of the hierarchy
            let nodes = d3.layout.tree().nodeSize([0,20]).nodes(this.root).slice(1);  
            let totalHeight = (nodes.length + 1) * this.barHeight;
            

            // set svg attributes
            this.svg.attr("width", width).attr("height", totalHeight)

            // select canvas objects in document
            d3.select("g")
                .transition()
                .duration(this.duration)
                .attr("height", totalHeight);

            d3.select(self.frameElement)
                .transition()
                .duration(this.duration)
                .style("height", height + "px");

            // add other attributes to the tree for visualization
            for (let ii = 0; ii < nodes.length; ii++) {
                nodes[ii].x = ii * this.barHeight;
                nodes[ii].y = (nodes[ii].depth - 1) * this.indent;
                nodes[ii]["width"] = this.tabWidth - nodes[ii].y - this.margin["right"] - this.margin["left"];
                nodes[ii]["txtRight"] = nodes[ii]["width"] - this.txtIndent;
            }

            // Binds data to node…
            let node = this.nodeGroup.selectAll(".node")
                .data(nodes, function(n) { return eval("n.id");});

            // add svg object wrapper to append rectangle objects
            var nodeEnter = node.enter().append("g")
                .attr("class", "node")
                .attr("transform", function(d) { return "translate( " + eval("source.y0") +", " + eval("source.x0") + ")";})
                .style("opacity", 1);

            // Enter any new nodes at the parent's previous position.
            nodeEnter.append("rect")
                .attr("y", -this.barHeight / 2)
                .attr("height", this.barHeight)
                .attr("width", function(d) {return d["width"];})
                .style("fill", this.color)
                .on("click", this.click);
                
            // add id text to rectangles
            nodeEnter.append("text")
                .attr("dy", 4)
                .attr("dx", this.txtIndent)
                .attr("id", "id")
                .text(function(d) { return eval("d.id");});

            // add value text to rectangles
            nodeEnter.append("text")
                .attr("dy", 4)
                .attr("dx", function(d) {return d["txtRight"];})
                .attr("text-anchor", "end")
                .attr("id", "rev")

            // update revenue text elements of svg-grouped objects
            if (this.isRevenue) {
                node.selectAll("text#rev")
                    .text(this.revenue);
            } else {
                node.selectAll("text#rev")
                    .text("");
            }
            
            // Transition nodes to their new position.
            nodeEnter.transition()
                .duration(this.duration)
                .attr("transform", function(d) { return "translate(" + eval("d.y") + "," + eval("d.x") + ")"; })
                .style("opacity", 1);

            node.transition()
                .duration(this.duration)
                .attr("transform", function(d) { return "translate(" + eval("d.y") + "," + eval("d.x") + ")"; })
                .style("opacity", 1)
                .select("rect")
                .style("fill", this.color);

            // Transition exiting nodes to the parent's new position.
            node.exit().transition()
                .duration(this.duration)
                .attr("transform", function(d) { return "translate(" + eval("source.y") + "," + eval("source.x") + ")"; })
                .style("opacity", 1e-6)
                .remove();

            // Stash the old positions for transition.
            for (let ii = 0; ii < nodes.length; ii++) {
                nodes[ii]["x0"] = nodes[ii].x;
                nodes[ii]["y0"] = nodes[ii].y;
            }

        }

        // collapse entire hierarchy table
        collapse = (d) => {

            function myCollapse(nodes) {
                if (nodes["children"]) {
                    nodes["children"].forEach( function(c) { myCollapse(c);});
                    if (nodes["depth"] > 0) {
                        nodes["_children"] = nodes["children"];
                        nodes["children"] = null;
                    }
                }
            }
            myCollapse(d);
            this.root = d;
            this.vizInit = false;
        }

        // Toggle children on click.
        click = (d) => {
            if (d["children"]) {
                d["_children"] = d["children"];
                d["children"] = null;
            } else {
                d["children"] = d["_children"];
                d["_children"] = null;
            }
            
            this.clickUpdate(d);
        }

        private updateVals(node, fakeNode) {
            let children, fakeNodeChil = fakeNode, nodeChil = node, n, ii, strVal;
            do {
                // update value of current node
                nodeChil["value"] = fakeNodeChil["value"];

                // find if there are children
                if (nodeChil["children"]) {
                    strVal = "children";
                } else if (nodeChil["_children"]) {
                    strVal = "_children";
                } else { return;}
                
                // get children nodes
                nodeChil = nodeChil[strVal];    
                // go through each child and recurse function
                for (ii = 0; ii < nodeChil.length; ii++) {
                    this.updateVals(nodeChil[ii], fakeNodeChil["children"][ii]);
                }
            } while (node["children"] || node["_children"])
            
            this.root = nodeChil;
        }

        private revenue = (d) => {
            return "$" + (Math.round(eval("d.value")*100)/100).toFixed(2);
        }

        public color(d) {
            return d._children ? "#3182bd" : d.children ? "#b4c2cb" : "#ffffff";
        }

        private getViewModel(options: VisualUpdateOptions): ViewModel {
            // get data
            let dv = options.dataViews[0];

            // initialize empty viewModel
            let viewModel: ViewModel = {
                dataPoints: []
            };

            // check to see if there are parent/child values to build the tree
            if (!dv
                || !dv.categorical
                || !dv.categorical.categories
                || !dv.categorical.categories[0]
                || !dv.categorical.categories[1]
                ) return viewModel; // if not enough values, then return an empty viewModel
            
            // check to see if there are revenue values
            let revVal = [];
            if (!dv.categorical.values
                || !dv.categorical.values[0]
                || !dv.categorical.values[0].values) {
                // if no revenue values, don't do anything
                this.isRevenue = false;
            } else {
                revVal = dv.categorical.values[0].values;   // get revenue values
                this.isRevenue = true;
            }

            // get name and parent data
            let nameVal = dv.categorical.categories[0].values;
            let parentVal = dv.categorical.categories[1].values;
 
            // push data into viewModel
            if (this.isRevenue) {
                // with revenue data
                for (let ii = 0; ii < Math.max(revVal.length, nameVal.length, parentVal.length); ii++) {
                    viewModel.dataPoints.push({
                        name: <string>nameVal[ii],
                        parent: <string>parentVal[ii],
                        revenue: <number>revVal[ii]
                    });
                }
            } else {
                // without revenue data
                for (let ii = 0; ii < Math.max(revVal.length, nameVal.length, parentVal.length); ii++) {
                    viewModel.dataPoints.push({
                        name: <string>nameVal[ii],
                        parent: <string>parentVal[ii],
                        revenue: 0
                    });
                }
            }

            // add a place holder tree root node in case there are multiple tree roots
            viewModel.dataPoints.push({name: "hierTop", parent: "", revenue: 0});

            return viewModel;
        }

        /** 
         * This function gets called for each of the objects defined in the capabilities files and allows you to select which of the 
         * objects and properties you want to expose to the users in the property pane.
         * 
         */
        // public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] | VisualObjectInstanceEnumerationObject {
        //     return VisualSettings.enumerateObjectInstances(this.settings || VisualSettings.getDefault(), options);
        // }
    }
}
